import { Text, View } from 'react-native';
import { colors, radius, space } from './theme';

/** A number with its change against the previous period ("+25%", "−40%", "new"). */
export function Stat({ label, value, change }: { label: string; value: number; change?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: space.md }}>
      <Text style={{ color: colors.textFaint, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      {change ? <Text style={{ color: change.startsWith('−') ? colors.danger : colors.success, fontSize: 12 }}>{change}</Text> : null}
    </View>
  );
}
