import React from 'react';
import { Pressable, StyleSheet, Text, TextProps, View, ViewProps } from 'react-native';

import { T, font } from './theme';

export function Screen({ style, ...rest }: ViewProps) {
  return <View style={[styles.screen, style]} {...rest} />;
}

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export function Label(props: TextProps) {
  return <Text {...props} style={[font.label, props.style]} />;
}
export function Body(props: TextProps) {
  return <Text {...props} style={[font.body, props.style]} />;
}
export function Small(props: TextProps) {
  return <Text {...props} style={[font.small, props.style]} />;
}
export function Title(props: TextProps) {
  return <Text {...props} style={[font.title, props.style]} />;
}
export function Display(props: TextProps) {
  return <Text {...props} style={[font.display, props.style]} />;
}

export function Button({
  title, onPress, kind = 'primary', disabled, style,
}: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: object }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && styles.btnPrimary,
        kind === 'ghost' && styles.btnGhost,
        kind === 'danger' && styles.btnDanger,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
      accessibilityRole="button">
      <Text style={[styles.btnText, kind === 'primary' && { color: T.bg }, kind === 'danger' && { color: T.danger }]}>{title}</Text>
    </Pressable>
  );
}

export function Row({ style, ...rest }: ViewProps) {
  return <View style={[styles.row, style]} {...rest} />;
}

export function Pill({ text, tone = 'accent' }: { text: string; tone?: 'accent' | 'accent2' | 'muted' | 'warm' }) {
  const color = { accent: T.accent, accent2: T.accent2, muted: T.muted, warm: T.warm }[tone];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[font.label, { color, fontSize: 10 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg, padding: T.pad, gap: 16 },
  card: { backgroundColor: T.surface, borderRadius: T.radius, padding: 16, gap: 8, borderWidth: 1, borderColor: T.line },
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: T.accent },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.line },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.danger },
  btnText: { fontSize: 16, fontWeight: '600', color: T.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
});
