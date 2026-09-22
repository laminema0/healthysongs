/**
 * The spectrum map: valence left→right, arousal bottom→top.
 *
 * Shows the live reading (teal), the journey path and target (violet), and
 * the library's tracks (faint dots) so the person can see what the system is
 * choosing between. Tap to place yourself: that's the manual check-in.
 */
import React from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Mood } from '@/engine/spectrum';
import { T } from './theme';

type Props = {
  size?: number;
  live?: Mood | null;
  liveConfidence?: number;
  target?: Mood | null;
  path?: Mood[];
  pathProgress?: number; // index of the current step
  tracks?: { id: string; mood: Mood; title?: string }[];
  highlightTrackId?: string | null;
  onPick?: (m: Mood) => void;
  showLabels?: boolean;
};

export function SpectrumMap({
  size = 300, live, liveConfidence = 1, target, path, pathProgress = 0, tracks, highlightTrackId, onPick, showLabels = true,
}: Props) {
  const pad = 26;
  const inner = size - pad * 2;
  const toX = (v: number) => pad + ((v + 1) / 2) * inner;
  const toY = (a: number) => pad + ((1 - a) / 2) * inner;

  const handle = (e: GestureResponderEvent) => {
    if (!onPick) return;
    // locationX is relative to the pressed view on phones; on web fall back to offsetX
    const ne = e.nativeEvent as GestureResponderEvent['nativeEvent'] & { offsetX?: number; offsetY?: number };
    const locationX = Number.isFinite(ne.locationX) ? ne.locationX : ne.offsetX ?? 0;
    const locationY = Number.isFinite(ne.locationY) ? ne.locationY : ne.offsetY ?? 0;
    const v = ((locationX - pad) / inner) * 2 - 1;
    const a = 1 - ((locationY - pad) / inner) * 2;
    onPick({ valence: Math.max(-1, Math.min(1, v)), arousal: Math.max(-1, Math.min(1, a)) });
  };

  const d = path && path.length > 1
    ? path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.valence).toFixed(1)} ${toY(p.arousal).toFixed(1)}`).join(' ')
    : null;

  return (
    <Pressable
      style={[styles.wrap, { width: size, height: size }]}
      onPress={onPick ? handle : undefined}
      disabled={!onPick}
      accessibilityRole={onPick ? 'adjustable' : undefined}
      accessibilityLabel="Mood map. Left is unpleasant, right is pleasant, top is high energy, bottom is low energy.">
      <Svg width={size} height={size}>
        <Rect x={pad} y={pad} width={inner} height={inner} rx={16} fill={T.surface} stroke={T.line} />
        {/* quadrant tints */}
        <Rect x={pad} y={pad} width={inner / 2} height={inner / 2} rx={16} fill={T.danger} opacity={0.05} />
        <Rect x={pad + inner / 2} y={pad} width={inner / 2} height={inner / 2} rx={16} fill={T.warm} opacity={0.06} />
        <Rect x={pad} y={pad + inner / 2} width={inner / 2} height={inner / 2} rx={16} fill={T.accent2} opacity={0.05} />
        <Rect x={pad + inner / 2} y={pad + inner / 2} width={inner / 2} height={inner / 2} rx={16} fill={T.accent} opacity={0.07} />
        <Line x1={toX(0)} y1={pad} x2={toX(0)} y2={pad + inner} stroke={T.line} strokeDasharray="3 5" />
        <Line x1={pad} y1={toY(0)} x2={pad + inner} y2={toY(0)} stroke={T.line} strokeDasharray="3 5" />

        {showLabels && (
          <G>
            <SvgText x={size / 2} y={pad - 9} fill={T.faint} fontSize={10} textAnchor="middle">HIGH ENERGY</SvgText>
            <SvgText x={size / 2} y={size - 8} fill={T.faint} fontSize={10} textAnchor="middle">LOW ENERGY</SvgText>
            <SvgText x={pad - 6} y={size / 2} fill={T.faint} fontSize={10} textAnchor="middle" transform={`rotate(-90 ${pad - 6} ${size / 2})`}>UNPLEASANT</SvgText>
            <SvgText x={size - pad + 12} y={size / 2} fill={T.faint} fontSize={10} textAnchor="middle" transform={`rotate(90 ${size - pad + 12} ${size / 2})`}>PLEASANT</SvgText>
            <SvgText x={pad + 10} y={pad + 16} fill={T.faint} fontSize={10}>tense</SvgText>
            <SvgText x={pad + inner - 10} y={pad + 16} fill={T.faint} fontSize={10} textAnchor="end">bright</SvgText>
            <SvgText x={pad + 10} y={pad + inner - 8} fill={T.faint} fontSize={10}>heavy</SvgText>
            <SvgText x={pad + inner - 10} y={pad + inner - 8} fill={T.faint} fontSize={10} textAnchor="end">calm</SvgText>
          </G>
        )}

        {tracks?.map((t) => (
          <Circle
            key={t.id}
            cx={toX(t.mood.valence)} cy={toY(t.mood.arousal)}
            r={t.id === highlightTrackId ? 6 : 3.5}
            fill={t.id === highlightTrackId ? T.accent2 : T.faint}
            opacity={t.id === highlightTrackId ? 1 : 0.7}
          />
        ))}

        {d && <Path d={d} stroke={T.accent2} strokeWidth={2} fill="none" strokeDasharray="6 4" opacity={0.9} />}
        {path?.map((p, i) => (
          <Circle key={i} cx={toX(p.valence)} cy={toY(p.arousal)} r={i <= pathProgress ? 5 : 3.5}
            fill={i <= pathProgress ? T.accent2 : T.surface} stroke={T.accent2} strokeWidth={1.5} />
        ))}

        {target && (
          <G>
            <Circle cx={toX(target.valence)} cy={toY(target.arousal)} r={11} fill="none" stroke={T.accent2} strokeWidth={1.5} />
            <Circle cx={toX(target.valence)} cy={toY(target.arousal)} r={3} fill={T.accent2} />
          </G>
        )}

        {live && (
          <G>
            <Circle cx={toX(live.valence)} cy={toY(live.arousal)} r={14} fill={T.accent} opacity={0.15 + liveConfidence * 0.15} />
            <Circle cx={toX(live.valence)} cy={toY(live.arousal)} r={7} fill={T.accent} opacity={0.5 + liveConfidence * 0.5} />
          </G>
        )}
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({ wrap: { alignSelf: 'center' } });
