/**
 * Journey: the path on the map, what's playing, where the reading is now.
 * The mechanism stays quiet; the journey is what's visible.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useJourneyRunner } from '@/audio/useJourneyRunner';
import { describeMood, targetByKey } from '@/engine/spectrum';
import { useSensing } from '@/sensing/useSensing';
import { useApp } from '@/store/useApp';
import { Body, Button, Card, Label, Pill, Row, Small, Title } from '@/ui/Basics';
import { SpectrumMap } from '@/ui/SpectrumMap';
import { T } from '@/ui/theme';

export default function JourneyScreen() {
  useKeepAwake();
  const router = useRouter();
  const sensing = useSensing();
  const manualCheckIn = useApp((s) => s.manualCheckIn);
  const jenStatus = useApp((s) => s.jenStatus);
  const { state, stop, skip, togglePause, journey, step } = useJourneyRunner();

  useEffect(() => {
    if (state.finished) router.replace('/summary');
  }, [state.finished, router]);

  if (!journey) {
    return (
      <View style={styles.center}>
        <Body>No journey running.</Body>
        <Button title="Back" onPress={() => router.replace('/')} kind="ghost" />
      </View>
    );
  }

  const current = journey.steps[step];
  const target = targetByKey(journey.targetKey);
  const region = describeMood(sensing.estimate);
  const pct = state.durationSec > 0 ? Math.min(1, state.positionSec / state.durationSec) : 0;

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {sensing.element}

      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Label>Heading to</Label>
          <Title style={{ color: T.accent2 }}>{journey.targetKey === 'balance' ? describeMood(journey.target).label : target.label}</Title>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>Step</Label>
          <Title>{step + 1} / {journey.steps.length}</Title>
        </View>
      </Row>

      <SpectrumMap
        size={320}
        live={sensing.source === 'none' ? null : sensing.estimate}
        liveConfidence={sensing.confidence}
        target={journey.target}
        path={journey.steps.map((s) => s.point)}
        pathProgress={step}
        tracks={journey.steps.map((s) => ({ id: s.track.id, mood: s.track.mood }))}
        highlightTrackId={current?.track.id}
        onPick={(m) => { Haptics.selectionAsync(); manualCheckIn(m); }}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Now playing</Label>
          <Pill text={state.playing ? 'playing' : 'paused'} tone={state.playing ? 'accent2' : 'muted'} />
        </Row>
        <Title>{current?.track.title ?? '—'}</Title>
        <View style={styles.bar}><View style={[styles.fill, { width: `${pct * 100}%` }]} /></View>
        {jenStatus && <Small style={{ color: T.accent2 }}>{jenStatus}</Small>}
        <Small>
          {fmt(state.positionSec)} / {fmt(state.durationSec)} · this track feels {describeMood(current.track.mood).label}
        </Small>
      </Card>

      <Card>
        <Label>Reading</Label>
        <Body>
          You seem <Text style={{ color: T.accent }}>{region.label}</Text> · {sensing.status}
        </Body>
        {state.lastChange && (
          <Small style={{ color: T.accent2 }}>
            {state.lastChange}{state.adjustments > 1 ? ` (changed ${state.adjustments}× so far)` : ''}
          </Small>
        )}
        <Small>Tap the map if that's off. The rest of the journey re-plans from where you put yourself.</Small>
      </Card>

      <Row>
        <Button title={state.playing ? 'Pause' : 'Play'} onPress={togglePause} kind="ghost" style={{ flex: 1 }} />
        <Button title="Skip" onPress={skip} kind="ghost" style={{ flex: 1 }} />
        <Button title="End" onPress={() => { stop(); router.replace('/summary'); }} kind="danger" style={{ flex: 1 }} />
      </Row>
    </ScrollView>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  bar: { height: 4, backgroundColor: T.line, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  fill: { height: 4, backgroundColor: T.accent2 },
});
