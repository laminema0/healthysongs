/**
 * Library: every track and where it sits on the spectrum. Tap one, then tap
 * the map to place it. Your ear is the model here.
 */
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { describeMood } from '@/engine/spectrum';
import { MANIFEST } from '@/library/manifest';
import { isTagged, useApp } from '@/store/useApp';
import { Button, Card, Label, Pill, Row, Small, Title } from '@/ui/Basics';
import { SpectrumMap } from '@/ui/SpectrumMap';
import { T } from '@/ui/theme';

export default function Library() {
  const tagOverrides = useApp((s) => s.tagOverrides);
  const hidden = useApp((s) => s.hiddenTracks);
  const setTrackMood = useApp((s) => s.setTrackMood);
  const setTrackHidden = useApp((s) => s.setTrackHidden);
  const library = useApp((s) => s.library);
  const jenTracks = useApp((s) => s.jenTracks);
  const removeJenTrack = useApp((s) => s.removeJenTrack);
  const [selected, setSelected] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const all = [
    ...MANIFEST.map((m) => ({ ...m, prompt: undefined as string | undefined, source: m.source as number | string })),
    ...jenTracks.map((t) => ({ id: t.id, title: t.title, source: t.source as number | string, mood: t.mood, tagged: true, prompt: t.prompt })),
  ].map((m) => {
    const o = tagOverrides[m.id];
    return { ...m, mood: o ? { valence: o.valence, arousal: o.arousal } : m.mood, tagged: isTagged(m.id, tagOverrides), hidden: !!hidden[m.id] };
  });
  const sel = all.find((t) => t.id === selected) ?? null;

  const stopPreview = () => {
    if (player.current) { try { player.current.pause(); player.current.remove(); } catch {} player.current = null; }
    setPreviewing(null);
  };
  useEffect(() => () => stopPreview(), []);

  const preview = (id: string, source: number | string) => {
    if (previewing === id) { stopPreview(); return; }
    stopPreview();
    const p = createAudioPlayer(source);
    player.current = p;
    p.play();
    setPreviewing(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ padding: 20, gap: 12 }}>
        <SpectrumMap
          size={280}
          tracks={library()}
          highlightTrackId={selected}
          onPick={sel ? (m) => setTrackMood(sel.id, m) : undefined}
          showLabels
        />
        {sel ? (
          <Card style={{ borderColor: T.accent2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Title>{sel.title}</Title>
              <Pill text={describeMood(sel.mood).label} tone="accent2" />
            </Row>
            <Small>Tap the map where this track sits. Where would it meet you, and where would it leave you?</Small>
            {sel.prompt ? <Small style={{ color: T.accent2 }}>Jen prompt: {sel.prompt}</Small> : null}
            <Row>
              <Button title={previewing === sel.id ? 'Stop' : 'Listen'} onPress={() => preview(sel.id, sel.source)} kind="ghost" style={{ flex: 1 }} />
              <Button title={sel.hidden ? 'Include' : 'Exclude'} onPress={() => setTrackHidden(sel.id, !sel.hidden)} kind="ghost" style={{ flex: 1 }} />
              {sel.id.startsWith('jen-') ? (
                <Button title="Delete" kind="danger" onPress={() => { stopPreview(); removeJenTrack(sel.id); setSelected(null); }} style={{ flex: 1 }} />
              ) : null}
              <Button title="Done" onPress={() => { stopPreview(); setSelected(null); }} style={{ flex: 1 }} />
            </Row>
          </Card>
        ) : (
          <Small style={{ textAlign: 'center' }}>Pick a track below, then tap the map to place it. Untagged tracks aren't used in journeys.</Small>
        )}
      </View>

      <FlatList
        data={all}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item.id)} style={[styles.rowItem, item.id === selected && styles.rowOn, item.hidden && { opacity: 0.45 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSub}>
                {item.tagged ? `${describeMood(item.mood).label} · v ${item.mood.valence.toFixed(2)} · a ${item.mood.arousal.toFixed(2)}` : 'untagged — tap to place'}
              </Text>
            </View>
            {item.hidden ? <Pill text="excluded" tone="muted" /> : item.id.startsWith('jen-') ? <Pill text="jen" tone="accent2" /> : item.tagged ? null : <Pill text="new" tone="warm" />}
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 12, gap: 4 }}>
            <Label>Adding music</Label>
            <Small>Drop files into assets/music/, run `node scripts/build-manifest.js`, restart the app. New tracks show up here as “new”.</Small>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line },
  rowOn: { borderColor: T.accent2 },
  rowTitle: { color: T.ink, fontSize: 15, fontWeight: '600' },
  rowSub: { color: T.muted, fontSize: 12, marginTop: 2 },
});
