/**
 * With Spotify: HealthySongs as a companion to what's playing on your phone.
 *
 * Every few seconds it looks at the song Spotify is playing and at how you
 * seem, and answers two questions:
 *   - Is this song helping, or pushing you further into the feeling?
 *   - What should come next? (a step lighter, toward where you're heading)
 * You can queue or play the suggestion yourself, or let it queue on its own
 * and replace songs that clearly make you feel worse.
 */
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { WORSE_BY, WORSE_FOR_MS, effectOf, isAvoided, verdict } from '@/engine/regulate';
import { Mood, TARGETS, autoTarget, describeMood } from '@/engine/spectrum';
import { useSensing } from '@/sensing/useSensing';
import { addToQueue, getNowPlaying, getQueueUris, playNow } from '@/spotify/api';
import { connectSpotify } from '@/spotify/auth';
import { knownMood, loadPool, rankCandidates, searchForPoint } from '@/spotify/suggest';
import { Candidate, NowPlaying, ZONES } from '@/spotify/types';
import { spotifyClientIdFrom, spotifyClientIdProblem, useApp } from '@/store/useApp';
import { Body, Button, Card, Label, Pill, Row, Small, Title } from '@/ui/Basics';
import { SpectrumMap } from '@/ui/SpectrumMap';
import { T } from '@/ui/theme';

const POLL_MS = 4000;

export default function SpotifyScreen() {
  useKeepAwake();
  const sensing = useSensing();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const tokens = useApp((s) => s.spotifyTokens);
  const setTokens = useApp((s) => s.setSpotifyTokens);
  const tags = useApp((s) => s.spotifyTags);
  const tagSpotify = useApp((s) => s.tagSpotify);
  const effects = useApp((s) => s.trackEffects);
  const recordTrackEffect = useApp((s) => s.recordTrackEffect);
  const manualCheckIn = useApp((s) => s.manualCheckIn);
  const addLog = useApp((s) => s.addLog);

  const [targetKey, setTargetKey] = useState('balance');
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState<Candidate[]>([]);
  const [offset, setOffset] = useState(0);
  const [feed, setFeed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const sensed = sensing.source !== 'none';
  const live = sensing.estimate;
  const target: Mood = useMemo(() => TARGETS.find((t) => t.key === targetKey)!.resolve(live), [targetKey, live]);
  const allCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [...pool, ...searched].filter((c) => (seen.has(c.uri) ? false : (seen.add(c.uri), true)));
  }, [pool, searched]);

  // refs for the polling loop, so it always sees the latest values
  const liveRef = useRef({ live, sensed, target });
  liveRef.current = { live, sensed, target };
  const allCandidatesRef = useRef(allCandidates);
  allCandidatesRef.current = allCandidates;
  const trackStart = useRef<{ uri: string; title: string; mood: Mood; target: Mood; at: number; sensed: boolean } | null>(null);
  const badSince = useRef<number | null>(null);
  const actedOn = useRef<Set<string>>(new Set());
  const recent = useRef<Set<string>>(new Set());

  const say = useCallback((text: string) => {
    setFeed((f) => [`${new Date().toTimeString().slice(0, 5)}  ${text}`, ...f].slice(0, 12));
    addLog({ kind: 'spotify', data: { text } });
  }, [addLog]);

  const ranked = useMemo(
    () => rankCandidates({ live, target, pool: allCandidates, effects, exclude: new Set([...recent.current, ...(now ? [now.uri] : [])]) }),
    [live, target, allCandidates, effects, now],
  );
  const suggestion = ranked.length ? ranked[offset % ranked.length] : null;
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;

  // load your zone playlists + tagged songs
  useEffect(() => {
    if (!tokens) return;
    loadPool(settings.spotifyPlaylists, tags)
      .then(({ pool: p, errors }) => { setPool(p); if (errors.length) setError(errors.join(' · ')); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [tokens, settings.spotifyPlaylists, tags]);

  // nothing suitable in your playlists: search for the next point (a guess)
  useEffect(() => {
    if (!tokens || ranked.length > 0) return;
    searchForPoint(live, target).then(setSearched).catch((e) => setError(String(e?.message ?? e)));
  }, [tokens, ranked.length, describeMood(live).key, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Rule 3: note what the song that just ended did to you. */
  const closeSong = useCallback(() => {
    const t = trackStart.current;
    trackStart.current = null;
    const { live: l, sensed: s } = liveRef.current;
    if (!t || !t.sensed || !s || Date.now() - t.at < 20000) return;
    const delta = effectOf(t.mood, l, t.target);
    recordTrackEffect(t.uri, delta, { source: 'spotify', title: t.title });
    if (delta > WORSE_BY) say(`“${t.title}” seemed to make you feel worse. It'll be suggested less (and not at all if it happens again).`);
    else if (delta < -0.15) say(`“${t.title}” seemed to help. Noted.`);
  }, [recordTrackEffect, say]);

  const replace = useCallback(async (why: string) => {
    const s = suggestionRef.current;
    if (!s) return;
    await playNow(s.uri);
    say(`${why} Playing “${s.title}” instead (${describeMood(s.mood).label}).`);
  }, [say]);

  // the loop
  useEffect(() => {
    if (!tokens) return;
    let stopped = false;
    const loop = async () => {
      try {
        const np = await getNowPlaying();
        if (stopped) return;
        setNow(np);
        setError(null);
        const { live: l, sensed: s, target: tg } = liveRef.current;

        if (np?.uri !== trackStart.current?.uri) {
          closeSong();
          badSince.current = null;
          setOffset(0);
          if (np) {
            trackStart.current = { uri: np.uri, title: np.title, mood: l, target: tg, at: Date.now(), sensed: s };
            recent.current.add(np.uri);
          }
        }
        if (!np || !np.isPlaying) return;

        // is this song helping?
        const st = useApp.getState();
        const known = knownMood(np.uri, st.spotifyTags, allCandidatesRef.current);
        const t = trackStart.current;
        const measured = t && t.sensed && s && Date.now() - t.at > 20000 ? effectOf(t.mood, l, t.target) : null;
        const knownBad = !!known && s && !verdict(known.mood, l, tg).ok;
        const learnedBad = isAvoided(st.trackEffects[np.uri]);
        const measuredBad = measured !== null && measured > WORSE_BY;
        if (knownBad || learnedBad || measuredBad) {
          badSince.current ??= Date.now();
          const wait = measuredBad && !knownBad && !learnedBad ? WORSE_FOR_MS : 8000;
          if (st.settings.spotifySkipWorse && Date.now() - badSince.current > wait && !actedOn.current.has(np.uri)) {
            actedOn.current.add(np.uri);
            await replace(
              measuredBad ? `You've seemed more ${describeMood(l).label} since “${np.title}” started.`
              : learnedBad ? `“${np.title}” made you feel worse before.`
              : `“${np.title}” sits at ${describeMood(known!.mood).label}, deeper into how you feel.`,
            );
          }
        } else {
          badSince.current = null;
        }

        // near the end: queue the next step
        const left = np.durationMs - np.progressMs;
        const sug = suggestionRef.current;
        if (st.settings.spotifyAutoQueue && sug && left < 25000 && !actedOn.current.has(`q:${np.uri}`)) {
          actedOn.current.add(`q:${np.uri}`);
          const queued = await getQueueUris().catch(() => [] as string[]);
          if (!queued.slice(0, 3).includes(sug.uri)) {
            await addToQueue(sug.uri);
            say(`Queued “${sug.title}” next (${describeMood(sug.mood).label}), a step toward ${describeMood(tg).label}.`);
          }
        }
      } catch (e: any) {
        if (!stopped) setError(String(e?.message ?? e));
      }
    };
    loop();
    const id = setInterval(loop, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [tokens, closeSong, replace, say]);

  const connect = async () => {
    setBusy(true); setError(null);
    try { setTokens(await connectSpotify(spotifyClientIdFrom(settings))); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const act = async (kind: 'queue' | 'play') => {
    if (!suggestion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (kind === 'queue') { await addToQueue(suggestion.uri); say(`Queued “${suggestion.title}”.`); }
      else { await playNow(suggestion.uri); say(`Playing “${suggestion.title}”.`); }
    } catch (e: any) { setError(String(e?.message ?? e)); }
  };

  // ---------- not connected ----------
  if (!tokens) {
    const clientId = spotifyClientIdFrom(settings);
    return (
      <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Title>HealthySongs with Spotify</Title>
        <Body>
          While Spotify plays on your phone, HealthySongs watches how you seem. If a song is pushing you deeper into anger or sadness, it tells you and suggests
          something a step lighter, and can queue or play it for you.
        </Body>
        <Small>Needs Spotify Premium to queue, play or skip (Spotify's rule). Without Premium it can still show what's playing and suggest.</Small>
        {spotifyClientIdProblem(clientId) && <Small style={{ color: T.warm }}>{spotifyClientIdProblem(clientId)}</Small>}
        {clientId ? (
          <Button title={busy ? 'Opening Spotify…' : 'Connect Spotify'} onPress={connect} disabled={busy} />
        ) : (
          <Card>
            <Label>One-time setup</Label>
            <Small>Add your Spotify Client ID in Settings → Spotify (the steps are there).</Small>
            <Link href="/settings" style={styles.link}>Open Settings</Link>
          </Card>
        )}
        {error && <Small style={{ color: T.warm }}>{error}</Small>}
      </ScrollView>
    );
  }

  // ---------- connected ----------
  const known = now ? knownMood(now.uri, tags, allCandidates) : null;
  const t = trackStart.current;
  const measured = t && t.sensed && sensed && now && Date.now() - t.at > 20000 ? effectOf(t.mood, live, t.target) : null;
  const v = known && sensed ? verdict(known.mood, live, target) : null;
  const status: { tone: 'accent2' | 'warm' | 'muted'; pill: string; text: string } =
    !now ? { tone: 'muted', pill: 'nothing', text: 'Nothing playing. Start something in Spotify.' }
    : now && isAvoided(effects[now.uri]) ? { tone: 'warm', pill: 'not helping', text: 'This song has made you feel worse before.' }
    : measured !== null && measured > WORSE_BY ? { tone: 'warm', pill: 'not helping', text: `Since it started you've seemed more ${describeMood(live).label}.` }
    : v ? { tone: v.ok ? 'accent2' : 'warm', pill: v.ok ? 'ok' : 'not helping', text: v.text[0].toUpperCase() + v.text.slice(1) + '.' }
    : !sensed ? { tone: 'muted', pill: 'no reading', text: 'No reading yet. Turn on the camera or tap the map.' }
    : { tone: 'muted', pill: 'watching', text: 'Not placed on the map yet. Watching how you respond to it (or tag it below).' };

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {sensing.element}

      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Label>Right now you seem</Label>
          <Title style={{ color: T.accent }}>{describeMood(live).label}</Title>
          <Small>{sensing.status}</Small>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>Heading to</Label>
          <Title style={{ color: T.accent2 }}>{describeMood(target).label}</Title>
        </View>
      </Row>

      <SpectrumMap
        size={300}
        live={sensed ? live : null}
        liveConfidence={sensing.confidence}
        target={target}
        path={suggestion ? [suggestion.mood] : []}
        pathProgress={-1}
        tracks={[
          ...(known && now ? [{ id: now.uri, mood: known.mood }] : []),
          ...(suggestion ? [{ id: suggestion.uri, mood: suggestion.mood }] : []),
        ]}
        highlightTrackId={now?.uri}
        onPick={(m) => { Haptics.selectionAsync(); manualCheckIn(m); }}
      />
      <Small style={{ textAlign: 'center' }}>Tap the map to say where you are. That always wins over the camera.</Small>

      <View style={styles.chips}>
        {TARGETS.map((tg) => (
          <Pressable key={tg.key} onPress={() => { setTargetKey(tg.key); setOffset(0); }} style={[styles.chip, tg.key === targetKey && styles.chipOn]}>
            <Text style={[styles.chipText, tg.key === targetKey && { color: T.bg }]}>{tg.label}</Text>
          </Pressable>
        ))}
      </View>
      {targetKey === 'balance' && <Small>Right now: {autoTarget(live).why}.</Small>}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Playing on Spotify</Label>
          <Pill text={status.pill} tone={status.tone} />
        </Row>
        <Title>{now ? now.title : '—'}</Title>
        {now && <Small>{now.artist}{known ? ` · ${known.basis}` : ''}</Small>}
        <Body style={{ color: status.tone === 'warm' ? T.warm : T.ink }}>{status.text}</Body>
        {now && (
          <>
            <Small>This song feels:</Small>
            <View style={styles.chips}>
              {ZONES.map((z) => (
                <Pressable key={z.key} onPress={() => { Haptics.selectionAsync(); tagSpotify(now.uri, { ...z.mood, zone: z.key, title: now.title, artist: now.artist }); }}
                  style={[styles.tag, tags[now.uri]?.zone === z.key && styles.tagOn]}>
                  <Text style={styles.tagText}>{z.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </Card>

      <Card style={{ borderColor: T.accent2 }}>
        <Label style={{ color: T.accent2 }}>Suggested next</Label>
        {suggestion ? (
          <>
            <Title>{suggestion.title}</Title>
            <Small>{suggestion.artist} · {describeMood(suggestion.mood).label} · {suggestion.basis}</Small>
            <Row>
              <Button title="Queue next" onPress={() => act('queue')} style={{ flex: 1 }} />
              <Button title="Play now" onPress={() => act('play')} kind="ghost" style={{ flex: 1 }} />
              <Button title="Another" onPress={() => setOffset((o) => o + 1)} kind="ghost" />
            </Row>
          </>
        ) : (
          <Small>Looking… Link playlists in Settings → Spotify for suggestions from music you chose.</Small>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body>Queue the next step on its own</Body>
            <Small>Near the end of each song, adds the suggestion to your queue.</Small>
          </View>
          <Switch value={settings.spotifyAutoQueue} onValueChange={(x) => update({ spotifyAutoQueue: x })} trackColor={{ true: T.accent2 }} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body>Replace songs that make it worse</Body>
            <Small>If a song is deeper into the feeling, or you get clearly worse while it plays, it plays the suggestion instead.</Small>
          </View>
          <Switch value={settings.spotifySkipWorse} onValueChange={(x) => update({ spotifySkipWorse: x })} trackColor={{ true: T.accent2 }} />
        </Row>
        <Small>Works while this screen is open.</Small>
      </Card>

      {error && <Small style={{ color: T.warm }}>{error}</Small>}

      {feed.length > 0 && (
        <Card>
          <Label>What it did</Label>
          {feed.map((f, i) => <Small key={i}>{f}</Small>)}
        </Card>
      )}

      <Button title="Disconnect Spotify" kind="danger" onPress={() => setTokens(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent2, borderColor: T.accent2 },
  chipText: { color: T.ink, fontWeight: '600' },
  tag: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: T.line },
  tagOn: { borderColor: T.accent, backgroundColor: T.surface2 },
  tagText: { color: T.ink, fontSize: 13 },
  link: { color: T.accent2, fontSize: 15, textDecorationLine: 'underline' },
});
