/**
 * Face sensor: a WebView running MediaPipe on-device.
 * Posts readings into the store. Renders as a small tile (or a 1px box when
 * the preview is off) so the page keeps running.
 */
import { useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { useApp } from '@/store/useApp';
import { Button, Small } from '@/ui/Basics';
import { T, font } from '@/ui/theme';
import { faceWebViewHtml } from './faceWebViewHtml';

export type FaceSensorState = { status: string; error: string | null; ready: boolean };

export function FaceSensor({ onState }: { onState?: (s: FaceSensorState) => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const showPreview = useApp((s) => s.settings.showCameraPreview);
  const faceReading = useApp((s) => s.faceReading);
  const [state, setState] = useState<FaceSensorState>({ status: 'starting', error: null, ready: false });

  useEffect(() => { onState?.(state); }, [state, onState]);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm]);

  const html = useMemo(() => faceWebViewHtml({ showPreview, fps: 8 }), [showPreview]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'reading') {
      faceReading({ valence: msg.valence, arousal: msg.arousal, confidence: msg.confidence, at: msg.at ?? Date.now() });
    } else if (msg.type === 'status') {
      setState((s) => ({ ...s, status: msg.text }));
    } else if (msg.type === 'ready') {
      setState((s) => ({ ...s, ready: true, status: 'reading' }));
    } else if (msg.type === 'error') {
      setState((s) => ({ ...s, error: msg.text, status: 'error' }));
    }
  }, [faceReading]);

  if (!perm) return null;
  if (!perm.granted) {
    return (
      <View style={styles.tile}>
        <Small>The camera is off. Face reading needs it; nothing is recorded or sent anywhere.</Small>
        <Button title="Allow camera" onPress={() => requestPerm()} kind="ghost" />
      </View>
    );
  }

  return (
    <View style={[styles.tile, !showPreview && styles.hidden]}>
      <WebView
        style={showPreview ? styles.web : styles.webHidden}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://moodpath.local/' }}
        onMessage={onMessage}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowFileAccess={false}
        onError={(e) => setState((s) => ({ ...s, error: e.nativeEvent.description, status: 'error' }))}
      />
      {showPreview && (
        <Text style={[font.mono, styles.overlay]}>{state.error ? `error: ${state.error}` : state.status}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, overflow: 'hidden', backgroundColor: T.surface2, height: 120, gap: 8, padding: 0 },
  hidden: { height: 2, opacity: 0.02, padding: 0 },
  web: { flex: 1, backgroundColor: T.surface2 },
  webHidden: { width: 2, height: 2, opacity: 0.02 },
  overlay: { position: 'absolute', left: 8, bottom: 6, color: T.accent },
});
