/**
 * Laptop sensor: fallback when the in-app WebView can't reach the camera.
 * Takes a small photo every ~1.5 s and posts it to server/read_face.py
 * running on your laptop (same Wi-Fi or a phone hotspot). The server
 * answers with a raw valence/arousal reading using the same weights.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/store/useApp';
import { Button, Small } from '@/ui/Basics';
import { T, font } from '@/ui/theme';
import { Text } from 'react-native';

export function LaptopSensor() {
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const url = useApp((s) => s.settings.laptopUrl);
  const showPreview = useApp((s) => s.settings.showCameraPreview);
  const faceReading = useApp((s) => s.faceReading);
  const [status, setStatus] = useState('starting');
  const busy = useRef(false);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm]);

  useEffect(() => {
    if (!perm?.granted) return;
    const id = setInterval(async () => {
      if (busy.current || !cam.current) return;
      busy.current = true;
      try {
        const pic = await cam.current.takePictureAsync({ base64: true, quality: 0.25, skipProcessing: true, shutterSound: false });
        if (!pic?.base64) return;
        const res = await fetch(`${url.replace(/\/$/, '')}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: pic.base64 }),
        });
        const j = await res.json();
        faceReading({ valence: j.valence ?? 0, arousal: j.arousal ?? 0, confidence: j.present ? 1 : 0, at: Date.now() });
        setStatus(j.present ? 'reading (laptop)' : 'no face (laptop)');
      } catch (e: any) {
        setStatus(`laptop unreachable: ${e?.message ?? e}`);
      } finally {
        busy.current = false;
      }
    }, 1500);
    return () => clearInterval(id);
  }, [perm?.granted, url, faceReading]);

  if (!perm) return null;
  if (!perm.granted) {
    return (
      <View style={styles.tile}>
        <Small>The camera is off. Face reading needs it; frames go only to your own laptop.</Small>
        <Button title="Allow camera" onPress={() => requestPerm()} kind="ghost" />
      </View>
    );
  }
  return (
    <View style={[styles.tile, !showPreview && styles.hidden]}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" animateShutter={false} mute />
      {showPreview && <Text style={[font.mono, styles.overlay]}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, overflow: 'hidden', backgroundColor: T.surface2, height: 120 },
  hidden: { height: 2, opacity: 0.02 },
  overlay: { position: 'absolute', left: 8, bottom: 6, color: T.accent },
});
