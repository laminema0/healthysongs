/**
 * Summary: what the journey did, one question back, and a note field.
 * This is the feedback that ends up in the case study.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { describeMood, targetByKey } from '@/engine/spectrum';
import { useApp } from '@/store/useApp';
import { Body, Button, Card, Label, Small, Title } from '@/ui/Basics';
import { SpectrumMap } from '@/ui/SpectrumMap';
import { T } from '@/ui/theme';

const RATINGS = ['Not at all', 'A little', 'Mostly', 'Exactly'];

export default function Summary() {
  const router = useRouter();
  const journey = useApp((s) => s.journey);
  const estimate = useApp((s) => s.fusion.estimate);
  const addLog = useApp((s) => s.addLog);
  const setJourney = useApp((s) => s.setJourney);
  const log = useApp((s) => s.log);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const stats = useMemo(() => {
    if (!journey) return null;
    const mine = log.filter((e) => (e.data as any).journey === journey.id);
    return {
      tracks: mine.filter((e) => e.kind === 'track').length,
      adjustments: mine.filter((e) => e.kind === 'adjust').length,
      checkins: log.filter((e) => e.kind === 'checkin' && e.at >= journey.startedAt).length,
      minutes: Math.round((Date.now() - journey.startedAt) / 60000),
    };
  }, [journey, log]);

  if (!journey) {
    return (
      <View style={styles.center}>
        <Body>Nothing to summarise.</Body>
        <Button title="Back" onPress={() => router.replace('/')} kind="ghost" />
      </View>
    );
  }

  const target = targetByKey(journey.targetKey);
  const from = describeMood(journey.from);
  const now = describeMood(estimate);

  const done = () => {
    addLog({ kind: 'feedback', data: { journey: journey.id, rating, ratingLabel: rating === null ? null : RATINGS[rating], note, endedAt: describeMood(estimate).key } });
    setJourney(null);
    router.replace('/');
  };

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Title>From {from.label} toward {target.label.toLowerCase()}.</Title>
      <Small>
        {stats?.tracks} tracks · {stats?.minutes} min · {stats?.adjustments} path adjustment{stats?.adjustments === 1 ? '' : 's'} · {stats?.checkins} check-in{stats?.checkins === 1 ? '' : 's'}
      </Small>

      <SpectrumMap
        size={300}
        live={estimate}
        target={journey.target}
        path={journey.steps.map((s) => s.point)}
        pathProgress={journey.steps.length}
        tracks={journey.steps.map((s) => ({ id: s.track.id, mood: s.track.mood }))}
      />
      <Small style={{ textAlign: 'center' }}>Where the reading ended up: {now.label}.</Small>

      <Card>
        <Label>Did it read you right at the start?</Label>
        <View style={styles.ratings}>
          {RATINGS.map((r, i) => (
            <Pressable key={r} onPress={() => setRating(i)} style={[styles.rating, rating === i && styles.ratingOn]}>
              <Text style={[styles.ratingText, rating === i && { color: T.bg }]}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Label>Anything to note</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="What felt right, what felt off, what you'd change"
          placeholderTextColor={T.faint}
          multiline
          style={styles.input}
        />
      </Card>

      <Button title="Done" onPress={done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rating: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: T.line },
  ratingOn: { backgroundColor: T.accent, borderColor: T.accent },
  ratingText: { color: T.ink, fontWeight: '600', fontSize: 13 },
  input: { color: T.ink, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
});
