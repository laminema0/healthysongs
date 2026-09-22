/**
 * Now: where you are on the spectrum, where you'd like to go, and Start.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { planJourney } from '@/engine/planner';
import { fillJourneyWithJen } from '@/jen/fill';
import { TARGETS, autoTarget, describeMood } from '@/engine/spectrum';
import { useSensing } from '@/sensing/useSensing';
import { isTagged, jenAvailable, jenConfigFrom, useApp } from '@/store/useApp';
import { Body, Button, Card, Label, Pill, Row, Small, Title } from '@/ui/Basics';
import { SpectrumMap } from '@/ui/SpectrumMap';
import { T } from '@/ui/theme';

export default function Now() {
  const router = useRouter();
  const consent = useApp((s) => s.consentGiven);
  const manualCheckIn = useApp((s) => s.manualCheckIn);
  const library = useApp((s) => s.library);
  const tagOverrides = useApp((s) => s.tagOverrides);
  const setJourney = useApp((s) => s.setJourney);
  const addLog = useApp((s) => s.addLog);
  const stepsOverride = useApp((s) => s.settings.stepsOverride);
  const explain = useApp((s) => s.settings.explainBeforeActing);
  const settings = useApp((s) => s.settings);
  const addJenTracks = useApp((s) => s.addJenTracks);
  const patchJourneyStep = useApp((s) => s.patchJourneyStep);
  const setJenStatus = useApp((s) => s.setJenStatus);
  const trackEffects = useApp((s) => s.trackEffects);
  const sensing = useSensing();
  const [targetKey, setTargetKey] = useState('balance');
  const [confirming, setConfirming] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!consent) router.replace('/consent');
  }, [consent, router]));

  const tracks = useMemo(() => library().filter((t) => isTagged(t.id, tagOverrides)), [library, tagOverrides]);
  const region = describeMood(sensing.estimate);
  const target = TARGETS.find((t) => t.key === targetKey)!;
  const targetMood = target.resolve(sensing.estimate);

  const preview = useMemo(
    () => planJourney({ from: sensing.estimate, target: targetMood, targetKey, library: tracks, steps: stepsOverride ?? target.steps, effects: trackEffects }),
    [sensing.estimate, targetMood, targetKey, tracks, stepsOverride, target.steps, trackEffects],
  );

  const useJen = settings.musicSource !== 'library' && jenAvailable(settings);

  const start = async () => {
    if (explain && !confirming) { setConfirming(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirming(false);
    const j = planJourney({ from: sensing.estimate, target: targetMood, targetKey, library: tracks, steps: stepsOverride ?? target.steps, effects: trackEffects });

    // music starts now, from the library; Jen composes the later steps meanwhile
    setJourney(j, 0);
    addLog({ kind: 'journey-start', data: { journey: j.id, from: j.from, target: j.target, targetKey, source: sensing.source, steps: j.steps.map((s) => s.track.id) } });
    router.push('/journey');

    if (useJen && j.steps.length > 1) {
      setJenStatus('Jen is deciding which of the next steps need a new track');
      fillJourneyWithJen({
        journey: j, mode: settings.musicSource, cfg: jenConfigFrom(settings),
        gapThreshold: settings.gapThreshold, durationSec: settings.jenDurationSec, taste: settings.jenTaste,
        fromStep: 1,
        onProgress: (p) => setJenStatus(p.total ? `Jen: ${p.done} of ${p.total} next tracks ready` : p.note),
        onStepReady: (i, t) => { patchJourneyStep(j.id, i, j.steps[i].point, t); },
      }).then((res) => {
        if (res.created.length) addJenTracks(res.created);
        addLog({ kind: 'selection', data: { journey: j.id, mode: settings.musicSource, decisions: res.decisions } });
        const failed = res.decisions.filter((d) => d.action === 'fallback');
        setJenStatus(failed.length ? `${failed.length} step(s) use your library instead: ${failed[0].error}` : null);
      }).catch((e: any) => setJenStatus(`Jen failed, using your library: ${e?.message ?? e}`));
    }
  };

  const enoughTracks = tracks.length >= 2;

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {sensing.element}

      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Label>Right now you seem</Label>
          <Title style={{ color: T.accent }}>{region.label}</Title>
          <Small>{sensing.status}</Small>
        </View>
        <Pill text={sensing.source === 'none' ? 'no reading' : sensing.source} tone={sensing.source === 'manual' ? 'accent' : 'muted'} />
      </Row>

      <SpectrumMap
        size={320}
        live={sensing.source === 'none' ? null : sensing.estimate}
        liveConfidence={sensing.confidence}
        target={targetMood}
        path={preview.steps.map((s) => s.point)}
        pathProgress={-1}
        tracks={tracks}
        onPick={(m) => { Haptics.selectionAsync(); manualCheckIn(m); setConfirming(false); }}
      />
      <Small style={{ textAlign: 'center' }}>Tap the map to say where you are. That always wins over the camera.</Small>

      <Label>Where to</Label>
      <View style={styles.targets}>
        {TARGETS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => { setTargetKey(t.key); setConfirming(false); }}
            style={[styles.target, t.key === targetKey && styles.targetOn]}>
            <Text style={[styles.targetText, t.key === targetKey && { color: T.bg }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Small>{targetKey === 'balance' ? `Right now: ${autoTarget(sensing.estimate).why}.` : target.description}</Small>

      {confirming ? (
        <Card style={{ borderColor: T.accent2 }}>
          <Label style={{ color: T.accent2 }}>Before the music moves</Label>
          <Body>
            It noticed you seem <Text style={{ color: T.accent }}>{region.label}</Text> ({region.hint}). It will start close to that but a little lighter, never deeper into it, then take {preview.steps.length} tracks to get to {targetKey === 'balance' ? describeMood(targetMood).label : target.label.toLowerCase()}. If a song seems to make you feel worse, it moves on.
            {useJen ? (settings.musicSource === 'jen' ? ' The first track starts right away; Jen composes the rest while you listen.' : ' Music starts right away from your library; where nothing is close enough, Jen composes the next tracks while you listen.') : ''}
          </Body>
          <Small>Not right? Tap the map where you actually are, then start again.</Small>
          <Row>
            <Button title="Sounds right, go" onPress={start} style={{ flex: 1 }} />
            <Button title="Cancel" onPress={() => setConfirming(false)} kind="ghost" />
          </Row>
        </Card>
      ) : (
        <Button title={enoughTracks ? `Start · ${preview.steps.length} tracks` : 'Tag some music first'} onPress={enoughTracks ? start : () => router.push('/library')} />
      )}

      <Row style={{ justifyContent: 'center', gap: 24, marginTop: 8 }}>
        <Link href="/spotify" style={styles.link}>Spotify</Link>
        <Link href="/library" style={styles.link}>Library · {tracks.length} tagged</Link>
        <Text style={styles.link}>{useJen ? `Jen: ${settings.musicSource}` : 'Jen: off'}</Text>
        <Link href="/settings" style={styles.link}>Settings</Link>
      </Row>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  target: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface },
  targetOn: { backgroundColor: T.accent2, borderColor: T.accent2 },
  targetText: { color: T.ink, fontWeight: '600' },
  link: { color: T.muted, fontSize: 14, textDecorationLine: 'underline' },
});
