import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from './theme';

// ---- Layout -----------------------------------------------------------------------------------------

/** A scrolling screen body with optional pull-to-refresh. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand600]} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted, small && styles.small]}>{children}</Text>;
}

/** Loading spinner, error with retry, or the content. */
export function LoadState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.body, styles.center]}>{error}</Text>
        {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
      </View>
    );
  }
  return <>{children}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <Body muted>{children}</Body>
    </Card>
  );
}

// ---- Messages ---------------------------------------------------------------------------------------

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'danger' | 'success' | 'info'; children: ReactNode }) {
  const toneStyle = {
    warn: { backgroundColor: colors.warnBg, color: colors.warnText },
    danger: { backgroundColor: colors.dangerBg, color: colors.dangerText },
    success: { backgroundColor: colors.successBg, color: colors.success },
    info: { backgroundColor: colors.brand50, color: colors.brand700 },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={{ color: toneStyle.color, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

// ---- Controls ---------------------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'link' && styles.buttonLink,
        pressed && { opacity: 0.8 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'link' ? colors.brand600 : '#fff'} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            (variant === 'secondary' || variant === 'link') && { color: variant === 'link' ? colors.brand700 : colors.text },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  optional,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string; optional?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional && <Text style={styles.muted}> (optional)</Text>}
      </Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...input}
        style={[styles.input, input.multiline && styles.inputMultiline, input.editable === false && styles.inputDisabled]}
        accessibilityLabel={label}
      />
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export function SwitchRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brand500, false: colors.borderStrong }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </View>
  );
}

/** Segmented choice: a row of pill buttons. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.pill, on && styles.pillOn]}
          >
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface PickerOption {
  value: string;
  label: string;
  /** Section header shown above this option (grouped lists, e.g. categories). */
  group?: string;
  indent?: boolean;
}

/** A form "select": shows the chosen label, opens a full-screen list to choose from. */
export function PickerField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  disabled,
  optional,
  error,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  optional?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional && <Text style={styles.muted}> (optional)</Text>}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.input, styles.pickerInput, disabled && styles.inputDisabled]}
      >
        <Text style={{ color: chosen ? colors.text : colors.textFaint, flex: 1 }}>{chosen?.label ?? placeholder}</Text>
        <Text style={styles.muted}>▾</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={[styles.row, styles.modalHeader]}>
            <Text style={[styles.heading, { flex: 1 }]}>{label}</Text>
            <Button title="Close" variant="link" onPress={() => setOpen(false)} />
          </View>
          <FlatList
            data={optional ? [{ value: '', label: 'None' }, ...options] : options}
            keyExtractor={(o) => o.value || '__none'}
            renderItem={({ item, index }) => {
              const list = optional ? [{ value: '', label: 'None' } as PickerOption, ...options] : options;
              const showGroup = item.group && item.group !== list[index - 1]?.group;
              return (
                <View>
                  {showGroup && <Text style={styles.groupHeader}>{item.group}</Text>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.value === value }}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.background }]}
                  >
                    <Text style={[styles.body, item.indent && { paddingLeft: space.lg }, item.value === value && { color: colors.brand700, fontWeight: '600' }]}>
                      {item.label}
                    </Text>
                    {item.value === value && <Text style={{ color: colors.brand700 }}>✓</Text>}
                  </Pressable>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ---- Badges -------------------------------------------------------------------------------------------

const STATUS_COLORS: Record<string, [string, string]> = {
  DRAFT: ['#f3f4f6', '#374151'],
  PENDING: ['#f3f4f6', '#374151'],
  PENDING_REVIEW: ['#fef3c7', '#92400e'],
  UNDER_REVIEW: ['#fef3c7', '#92400e'],
  SCHEDULED: ['#dbeafe', '#1e40af'],
  ACTIVE: ['#dcfce7', '#166534'],
  VERIFIED: ['#dcfce7', '#166534'],
  PAUSED: ['#e2e8f0', '#1e293b'],
  EXPIRED: ['#e5e7eb', '#4b5563'],
  REJECTED: ['#fee2e2', '#991b1b'],
  SUSPENDED: ['#fee2e2', '#991b1b'],
  CLOSED: ['#e5e7eb', '#374151'],
};

export function StatusBadge({ status }: { status: string }) {
  const [bg, fg] = STATUS_COLORS[status] ?? ['#f3f4f6', '#374151'];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '500' }}>{status.replaceAll('_', ' ').toLowerCase()}</Text>
    </View>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.brand600 }]}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  muted: { color: colors.textMuted },
  small: { fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, textAlign: 'center' },
  notice: { borderRadius: radius.sm, padding: space.md },
  error: { color: colors.danger, fontSize: 13, marginTop: 2 },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.brand600 },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  buttonDanger: { backgroundColor: colors.danger },
  buttonLink: { backgroundColor: 'transparent', paddingHorizontal: space.sm, minHeight: 36 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  inputDisabled: { backgroundColor: colors.background, color: colors.textFaint },
  pickerInput: { flexDirection: 'row', alignItems: 'center' },
  modalHeader: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  groupHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
  option: {
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  pillText: { color: colors.text, fontSize: 14 },
  pillTextOn: { color: '#fff', fontWeight: '600' },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
