/**
 * First screen. The privacy principle from the interviews lives here:
 * say what is sensed, where it goes (nowhere), and let the person choose.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';

import { useApp } from '@/store/useApp';
import { Body, Button, Card, Display, Label, Screen, Small } from '@/ui/Basics';
import { T } from '@/ui/theme';

export default function Consent() {
  const router = useRouter();
  const setConsent = useApp((s) => s.setConsent);
  const updateSettings = useApp((s) => s.updateSettings);

  const go = (mode: 'face' | 'manual') => {
    updateSettings({ sensingMode: mode });
    setConsent(true);
    router.replace('/');
  };

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Display>Music that helps you back to steady.</Display>
      <Body>
        This app tries to notice how you feel and helps you toward a steadier place: if you're sad the music gets gently brighter, if you're angry it gets calmer. It starts close to how you feel but always a little lighter, never deeper into it. You can choose the direction yourself.
      </Body>

      <Card>
        <Label>What it senses</Label>
        <Body>Your facial expression, through the front camera, turned into two numbers: how pleasant and how energised you seem. That is all it keeps.</Body>
        <Small>Frames are processed on the phone and discarded. No images are stored or sent anywhere.</Small>
      </Card>

      <Card>
        <Label>What you control</Label>
        <Body>The camera can be off entirely. Tapping the map to say how you feel works just as well, and always overrides what the camera thinks.</Body>
        <Small>It also tells you what it noticed before the music changes, so you can correct it.</Small>
      </Card>

      <Button title="Use the camera" onPress={() => go('face')} />
      <Button title="No camera, I’ll tell it myself" onPress={() => go('manual')} kind="ghost" />
      <Small style={{ textAlign: 'center' }}>You can change this any time in Settings.</Small>
    </ScrollView>
  );
}
