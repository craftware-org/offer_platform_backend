import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { combineDayAndTime, formatDate, formatTime } from '@/lib/time';
import type { CategoryNode } from '@/lib/types';
import { colors } from './theme';
import { Button, ErrorText, PickerField, styles } from './ui';

/** Category from the database-driven tree; a parent can be chosen as "(general)". */
export function CategoryPicker({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  useEffect(() => {
    api<CategoryNode[]>('/categories', { auth: false })
      .then(setTree)
      .catch(() => setTree([]));
  }, []);
  const options = tree.flatMap((parent) => [
    { value: parent.id, label: `${parent.name} (general)`, group: parent.name },
    ...parent.children.map((c) => ({ value: c.id, label: c.name, group: parent.name, indent: true })),
  ]);
  return <PickerField label="Category" value={value} options={options} onChange={onChange} disabled={disabled} error={error} />;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** A picked photo ready for upload. */
export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

/** Camera or gallery → one photo (the API re-encodes it to WebP and strips location metadata). */
export async function pickImage(): Promise<PickedImage | null> {
  const source = await new Promise<'camera' | 'library' | null>((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take photo', 'Choose from gallery', 'Cancel'], cancelButtonIndex: 2 },
        (i) => resolve(i === 0 ? 'camera' : i === 1 ? 'library' : null),
      );
      return;
    }
    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Choose from gallery', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
  if (!source) return null;

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is off. Allow it in Settings to take a photo.');
  }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw new Error('The photo is larger than 8 MB.');
  const type = asset.mimeType ?? 'image/jpeg';
  const ext = type.split('/')[1] ?? 'jpg';
  return { uri: asset.uri, name: asset.fileName ?? `photo.${ext}`, type };
}

/** Picks a photo and uploads it (multipart field "file") to `path`. */
export function ImageUploadButton({
  path,
  label,
  onUploaded,
  disabled,
}: {
  path: string;
  label: string;
  onUploaded: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setError(null);
    try {
      const file = await pickImage();
      if (!file) return;
      setBusy(true);
      await api(path, { method: 'POST', file });
      await onUploaded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Button title={busy ? 'Uploading…' : label} variant="secondary" busy={busy} disabled={disabled} onPress={() => void run()} />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** Date and time, using the native Android pickers. */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  error,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  error?: string;
}) {
  const openDate = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onValueChange: (_e, day) => onChange(combineDayAndTime(day, value)),
    });
  const openTime = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'time',
      is24Hour: false,
      onValueChange: (_e, time) => onChange(combineDayAndTime(value, time)),
    });
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} date`} onPress={openDate} style={[styles.input, { flex: 3, justifyContent: 'center' }]}>
          <Text style={{ color: colors.text }}>{formatDate(value)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} time`} onPress={openTime} style={[styles.input, { flex: 2, justifyContent: 'center' }]}>
          <Text style={{ color: colors.text }}>{formatTime(value)}</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
