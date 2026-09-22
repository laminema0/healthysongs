/**
 * Settings: how it senses, how it behaves, and the export of everything it
 * logged (that export is your research data).
 */
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DEFAULT_FUSION } from '@/engine/fusion';
import { jenClearCache } from '@/jen/client';
import { MusicSource } from '@/jen/fill';
import { spotifyRedirectUri } from '@/spotify/auth';
import { ZONES } from '@/spotify/types';
import { SensingMode, jenConfigFrom, spotifyClientIdFrom, spotifyClientIdProblem, useApp } from '@/store/useApp';
import { Body, Button, Card, Label, Row, Small, Title } from '@/ui/Basics';
import { T } from '@/ui/theme';

const SOURCES: { key: MusicSource; label: string; hint: string }[] = [
  { key: 'mixed', label: 'Library + Jen', hint: 'Your tracks where one fits the step; Jen composes where nothing is close enough.' },
  { key: 'jen', label: 'Jen only', hint: 'Every step composed for its exact point on the map.' },
  { key: 'library', label: 'Library only', hint: 'No generation. Offline.' },
];

const MODES: { key: SensingMode; label: string; hint: string }[] = [
  { key: 'face', label: 'Camera (on phone)', hint: 'MediaPipe runs inside the app. Needs internet the first time to fetch the model.' },
  { key: 'manual', label: 'Manual only', hint: 'No camera. You tap the map.' },
  { key: 'laptop', label: 'Camera via laptop', hint: 'Sends small frames to server/read_face.py on your laptop. Use if the in-app camera page won’t start.' },
  { key: 'demo', label: 'Demo trajectory', hint: 'Scripted tense → calm reading for screen recordings.' },
];

function Stepper({ label, value, step, min, max, onChange, fmt }: { label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Small style={{ flex: 1 }}>{label}</Small>
      <Row>
        <Pressable onPress={() => onChange(Math.max(min, +(value - step).toFixed(3)))} style={styles.stepBtn}><Text style={styles.stepTxt}>−</Text></Pressable>
        <Text style={styles.stepVal}>{fmt ? fmt(value) : value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, +(value + step).toFixed(3)))} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
      </Row>
    </Row>
  );
}

export default function Settings() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const updateFusion = useApp((s) => s.updateFusionConfig);
  const log = useApp((s) => s.log);
  const clearLog = useApp((s) => s.clearLog);
  const resetFusion = useApp((s) => s.resetFusion);
  const setConsent = useApp((s) => s.setConsent);
  const jenTracks = useApp((s) => s.jenTracks);
  const clearJenTracks = useApp((s) => s.clearJenTracks);
  const jen = jenConfigFrom(settings);
  const keySource = settings.jenApiKey.trim() ? 'typed here' : jen.apiKey ? 'from .env.local' : 'none';
  const spotifyConnected = useApp((s) => !!s.spotifyTokens);
  const spotifyId = spotifyClientIdFrom(settings);

  const exportLog = async () => {
    const payload = { exportedAt: new Date().toISOString(), settings, events: log };
    await Share.share({ title: 'healthysongs-log.json', message: JSON.stringify(payload, null, 1) });
  };

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Card>
        <Label>Sensing</Label>
        {MODES.map((m) => (
          <Pressable key={m.key} onPress={() => { update({ sensingMode: m.key }); resetFusion(); }} style={[styles.mode, settings.sensingMode === m.key && styles.modeOn]}>
            <Text style={[styles.modeLabel, settings.sensingMode === m.key && { color: T.accent }]}>{m.label}</Text>
            <Small>{m.hint}</Small>
          </Pressable>
        ))}
        {settings.sensingMode === 'laptop' && (
          <View style={{ gap: 4 }}>
            <Small>Laptop server URL</Small>
            <TextInput value={settings.laptopUrl} onChangeText={(t) => update({ laptopUrl: t })} autoCapitalize="none" autoCorrect={false} style={styles.input} />
          </View>
        )}
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>Show camera preview</Body>
          <Switch value={settings.showCameraPreview} onValueChange={(v) => update({ showCameraPreview: v })} trackColor={{ true: T.accent }} />
        </Row>
      </Card>

      <Card>
        <Label>Music · Jen</Label>
        {SOURCES.map((m) => (
          <Pressable key={m.key} onPress={() => update({ musicSource: m.key })} style={[styles.mode, settings.musicSource === m.key && styles.modeOn]}>
            <Text style={[styles.modeLabel, settings.musicSource === m.key && { color: T.accent2 }]}>{m.label}</Text>
            <Small>{m.hint}</Small>
          </Pressable>
        ))}
        <Small>API key: {keySource}{jen.apiKey ? ` (…${jen.apiKey.slice(-4)})` : ''}</Small>
        <TextInput value={settings.jenApiKey} onChangeText={(t) => update({ jenApiKey: t })} placeholder="Paste a key to override .env.local" placeholderTextColor={T.faint}
          autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} />
        <Small>Style note, added to every prompt</Small>
        <TextInput value={settings.jenTaste} onChangeText={(t) => update({ jenTaste: t })} placeholder="e.g. with Persian setar and soft daf" placeholderTextColor={T.faint} style={styles.input} />
        <Stepper label="Track length, seconds" value={settings.jenDurationSec} step={15} min={15} max={180} onChange={(v) => update({ jenDurationSec: v })} />
        <Stepper label="Compose when nearest track is farther than" value={settings.gapThreshold} step={0.05} min={0.1} max={1} onChange={(v) => update({ gapThreshold: v })} fmt={(v) => v.toFixed(2)} />
        <Small>Proxy URL (optional, keeps the key on your laptop)</Small>
        <TextInput value={settings.jenProxyUrl} onChangeText={(t) => update({ jenProxyUrl: t })} placeholder="http://192.168.0.23:8766" placeholderTextColor={T.faint} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Small>{jenTracks.length} composed track{jenTracks.length === 1 ? '' : 's'} saved on this phone (they join the library).</Small>
        <Button title="Delete composed tracks" kind="danger" onPress={() => { try { jenClearCache(); } catch {} clearJenTracks(); }} />
      </Card>

      <Card>
        <Label>Spotify</Label>
        <Small>
          1. developer.spotify.com → Dashboard → Create app, tick Web API.{'\n'}
          2. Add this Redirect URI to the app (copy it exactly):
        </Small>
        <Text selectable style={styles.code}>{spotifyRedirectUri()}</Text>
        <Small>
          3. Settings → User Management: add the email of your Spotify account (Development mode only lets listed users in).{'\n'}
          4. Paste the app's Client ID here, then open Now → Spotify and connect.
        </Small>
        <Small>Client ID: {settings.spotifyClientId.trim() ? 'typed here' : spotifyId ? 'from .env.local' : 'none'} · {spotifyConnected ? 'connected' : 'not connected'}</Small>
        <TextInput value={settings.spotifyClientId} onChangeText={(t) => update({ spotifyClientId: t.trim() })} placeholder="Spotify Client ID" placeholderTextColor={T.faint}
          autoCapitalize="none" autoCorrect={false} style={styles.input} />
        {spotifyClientIdProblem(spotifyId) && <Small style={{ color: T.warm }}>{spotifyClientIdProblem(spotifyId)}</Small>}
        <Small>Optional: link one of your own playlists to each zone, so suggestions come from music you chose. Paste the playlist link (Share → Copy link). Only playlists you own or collaborate on work.</Small>
        {ZONES.filter((z) => z.search).map((z) => (
          <View key={z.key} style={{ gap: 4 }}>
            <Small>{z.label} · {z.hint}</Small>
            <TextInput value={settings.spotifyPlaylists[z.key] ?? ''} onChangeText={(t) => update({ spotifyPlaylists: { ...settings.spotifyPlaylists, [z.key]: t.trim() } })}
              placeholder="https://open.spotify.com/playlist/…" placeholderTextColor={T.faint} autoCapitalize="none" autoCorrect={false} style={styles.input} />
          </View>
        ))}
      </Card>

      <Card>
        <Label>Behaviour</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body>Explain before acting</Body>
            <Small>Say what it noticed and wait for a yes before the journey starts.</Small>
          </View>
          <Switch value={settings.explainBeforeActing} onValueChange={(v) => update({ explainBeforeActing: v })} trackColor={{ true: T.accent }} />
        </Row>
        <Stepper label="Tracks per journey (0 = target’s default)" value={settings.stepsOverride ?? 0} step={1} min={0} max={8}
          onChange={(v) => update({ stepsOverride: v === 0 ? null : v })} />
      </Card>

      <Card>
        <Label>Reading (tune after testing, log what you change)</Label>
        <Stepper label="Smoothing, seconds" value={settings.fusion.fastTauMs / 1000} step={0.5} min={0.5} max={10} onChange={(v) => updateFusion({ fastTauMs: v * 1000 })} />
        <Stepper label="Resting-face baseline, seconds" value={settings.fusion.baselineTauMs / 1000} step={10} min={10} max={300} onChange={(v) => updateFusion({ baselineTauMs: v * 1000 })} />
        <Stepper label="Face gain" value={settings.fusion.faceGain} step={0.2} min={0.4} max={6} onChange={(v) => updateFusion({ faceGain: v })} fmt={(v) => v.toFixed(1)} />
        <Stepper label="Manual check-in lasts, minutes" value={settings.fusion.manualTtlMs / 60000} step={1} min={1} max={30} onChange={(v) => updateFusion({ manualTtlMs: v * 60000 })} />
        <Button title="Reset to defaults" kind="ghost" onPress={() => updateFusion(DEFAULT_FUSION)} />
      </Card>

      <Card>
        <Label>Research log</Label>
        <Small>{log.length} events: readings (every 5 s), check-ins, journeys, tracks, adjustments, feedback. Stays on the phone until you export it.</Small>
        <Row>
          <Button title="Export as JSON" onPress={exportLog} style={{ flex: 1 }} />
          <Button title="Clear" kind="danger" onPress={clearLog} />
        </Row>
      </Card>

      <Button title="Show the consent screen again" kind="ghost" onPress={() => setConsent(false)} />
      <Small style={{ textAlign: 'center' }}>HealthySongs · 10-Day Challenge prototype</Small>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mode: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: T.line, gap: 2 },
  modeOn: { borderColor: T.accent, backgroundColor: T.surface2 },
  modeLabel: { color: T.ink, fontWeight: '600', fontSize: 15 },
  code: { color: T.accent2, fontFamily: 'monospace', fontSize: 12, padding: 8, borderRadius: 8, backgroundColor: T.surface2 },
  input: { color: T.ink, borderWidth: 1, borderColor: T.line, borderRadius: 10, padding: 10, fontSize: 15 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: T.ink, fontSize: 18 },
  stepVal: { color: T.ink, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
