import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { confirm } from '../confirm';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import {
  getLineById,
  deleteLine,
  toggleLineFavorite,
  Line,
} from '../db/database';
import { Header, Workbench, Drawer } from '../components';
import { RootStackParamList, LineFilter } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LineDetail'>;
  route: RouteProp<RootStackParamList, 'LineDetail'>;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function tagsForLine(line: Line): LineFilter[] {
  const out: LineFilter[] = [];
  if (line.tide) out.push({ kind: 'tide', value: line.tide });
  if (line.terrain) out.push({ kind: 'terrain', value: line.terrain });
  if (line.constellation) out.push({ kind: 'constellation', value: line.constellation });
  if (line.topic) out.push({ kind: 'topic', value: line.topic });
  if (line.mode && line.mode !== 'fragment') out.push({ kind: 'mode', value: line.mode });
  return out;
}

// Single-line source label — same vocabulary as the Drift forecast, derived
// from the line's own tags/mode/text without other context.
function sourceForLine(line: Line): string {
  if (line.constellation) return 'old conversation';
  if (line.mode === 'paradox' || line.mode === 'contradiction' || line.mode === 'invert') return 'contradiction';
  if (line.terrain && /sharp|hardened|narrow|tender/i.test(line.terrain)) return 'body pressure';
  if (line.tide && /low tide|dead calm|slack water|golden hour|glass water/i.test(line.tide)) return 'quiet after release';
  if (line.tide && /storm front|building chop|heavy current|returning swell|rising swell/i.test(line.tide)) return 'fresh swell';
  if (/never|always|but|yet|still|even though|paradox/i.test(line.content)) return 'contradiction';
  if (line.mode === 'aphorism' || line.mode === 'aside' || line.mode === 'complete' || line.mode === 'distill') return 'returning memory';
  return 'unfinished thought';
}

function filterLabel(f: LineFilter): string {
  switch (f.kind) {
    case 'tide': return `tide · ${f.value}`;
    case 'terrain': return `terrain · ${f.value}`;
    case 'constellation': return `with · ${f.value}`;
    case 'topic': return `topic · ${f.value}`;
    case 'mode': return `mode · ${f.value}`;
  }
}

// Copy to clipboard. Web uses navigator.clipboard; on native, fall back to
// Share (the user can pick "copy" from the share sheet). Avoids pulling in
// the deprecated Clipboard module or a heavy native dep.
async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export default function LineDetailScreen({ navigation, route }: Props) {
  const { lineId } = route.params;
  const [line, setLine] = useState<Line | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    const l = await getLineById(lineId);
    setLine(l);
  }, [lineId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1500);
  }

  async function handleCopy() {
    if (!line) return;
    const ok = await copyText(line.content);
    if (ok) {
      showFlash('copied');
    } else {
      // Native fallback: open the share sheet so the user can choose copy.
      try {
        await Share.share({ message: line.content });
      } catch {}
    }
  }

  async function handleShare() {
    if (!line) return;
    try {
      await Share.share({ message: line.content });
    } catch {}
  }

  // Share-as-image: native image rendering would require a heavy dep
  // (react-native-view-shot) and platform-specific share APIs. On web we use
  // a Canvas to rasterise the line into a PNG and trigger a download/share;
  // on native we fall back to plain share with a clear note. See README.
  async function handleShareAsImage() {
    if (!line) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const ok = renderLineToImageWeb(line);
      if (ok) {
        showFlash('image saved');
        return;
      }
    }
    // TODO: native share-as-image once a non-bundle-bloating render path is
    // available (e.g. expo-media-library + react-native-view-shot). For now
    // fall back to a regular share so users always have an export route.
    try {
      await Share.share({ message: line.content });
      showFlash('shared');
    } catch {}
  }

  function handleReshape() {
    if (!line) return;
    navigation.navigate('Verso', {
      seedContent: line.content,
      seedMode: 'aphorism',
      seedLineId: line.id,
    });
  }

  async function handleToggleFavorite() {
    if (!line) return;
    await toggleLineFavorite(line.id, line.is_favorite === 0);
    await load();
  }

  async function handleRelease() {
    if (!line) return;
    const ok = await confirm({
      title: 'Release this line?',
      message: 'It will leave the archive.',
      confirmLabel: 'Release',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    await deleteLine(line.id);
    navigation.goBack();
  }

  function followCurrent(f: LineFilter) {
    navigation.navigate('Lines', { filter: f });
  }

  if (!line) {
    return (
      <View style={styles.container}>
        <Header
          title="Line"
          onBack={() => navigation.goBack()}
          onMenu={() => setMenuOpen(true)}
        />
        <Drawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>this line has slipped away</Text>
        </View>
      </View>
    );
  }

  const tags = tagsForLine(line);
  const source = sourceForLine(line);

  return (
    <View style={styles.container}>
      <Header
        title="Line"
        onBack={() => navigation.goBack()}
        onMenu={() => setMenuOpen(true)}
        rightAction={
          <TouchableOpacity
            onPress={handleToggleFavorite}
            activeOpacity={0.7}
            accessibilityLabel="favorite"
            testID="line-favorite"
          >
            <Text style={[styles.starIcon, line.is_favorite === 1 && styles.starActive]}>★</Text>
          </TouchableOpacity>
        }
      />
      <Drawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Workbench size="narrow">
        <View style={styles.artifact} testID="line-artifact">
          <Text style={styles.modeLabel}>{line.mode}</Text>
          <Text style={styles.lineContent} selectable>{line.content}</Text>
          {line.template && (
            <Text style={styles.template}>{line.template}</Text>
          )}
        </View>

        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map((t) => (
              <TouchableOpacity
                key={`${t.kind}:${t.value}`}
                onPress={() => followCurrent(t)}
                activeOpacity={0.7}
                style={styles.tag}
                accessibilityLabel={`follow current ${filterLabel(t)}`}
              >
                <Text style={styles.tagText}>{filterLabel(t)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.sourceText} testID="line-source">source · {source}</Text>
        <Text style={styles.dateText}>kept on {formatDate(line.created_at)}</Text>

        {flash && <Text style={styles.flash}>{flash}</Text>}

        <View style={styles.actions}>
          <ActionButton label="copy"            onPress={handleCopy} testID="action-copy" />
          <ActionButton label="reshape"         onPress={handleReshape} testID="action-reshape" />
          <ActionButton label="share"           onPress={handleShare} testID="action-share" />
          <ActionButton label="share as image"  onPress={handleShareAsImage} testID="action-share-image" />
        </View>

        <TouchableOpacity
          style={styles.release}
          onPress={handleRelease}
          activeOpacity={0.7}
          accessibilityLabel="release this line"
          testID="action-release"
        >
          <Text style={styles.releaseText}>release this line</Text>
        </TouchableOpacity>
        </Workbench>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label, onPress, testID,
}: { label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
      accessibilityLabel={label}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

// Web-only image renderer. Draws the line into a canvas and triggers a
// download. Returns true on success, false if it could not render.
function renderLineToImageWeb(line: Line): boolean {
  try {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    const W = 1080, H = 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // Background
    ctx.fillStyle = Colors.deepNavy;
    ctx.fillRect(0, 0, W, H);

    // Subtle horizon band
    ctx.fillStyle = Colors.navy;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);

    // Accent line — muted turquoise
    ctx.fillStyle = Colors.amber;
    ctx.fillRect(80, 80, 4, 120);

    // Body text
    ctx.fillStyle = Colors.saltWhite;
    ctx.font = '500 56px serif';
    ctx.textBaseline = 'top';
    const words = line.content.split(/\s+/);
    const maxWidth = W - 160;
    let x = 80;
    let y = 240;
    let bufferLine = '';
    for (const word of words) {
      const test = bufferLine ? bufferLine + ' ' + word : word;
      const w = ctx.measureText(test).width;
      if (w > maxWidth) {
        ctx.fillText(bufferLine, x, y);
        y += 80;
        bufferLine = word;
      } else {
        bufferLine = test;
      }
    }
    if (bufferLine) ctx.fillText(bufferLine, x, y);

    // Footer mark
    ctx.fillStyle = Colors.muted;
    ctx.font = '400 24px sans-serif';
    ctx.fillText('CURRENT', 80, H - 110);
    ctx.fillStyle = Colors.mutedLight;
    ctx.font = 'italic 22px serif';
    ctx.fillText(line.mode, 80, H - 70);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `current-line-${line.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  scroll: {
    padding: Spacing.lg,
  },
  artifact: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
    marginBottom: Spacing.lg,
  },
  modeLabel: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  lineContent: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    lineHeight: 48,
  },
  template: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    marginTop: Spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  tagText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  sourceText: {
    color: Colors.sand,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  dateText: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
  },
  flash: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  actionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  actionButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  release: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  releaseText: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    textDecorationLine: 'underline',
  },
  starIcon: {
    color: Colors.muted,
    fontSize: FontSizes.xl,
  },
  starActive: {
    color: Colors.amber,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  missingText: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.lg,
  },
});
