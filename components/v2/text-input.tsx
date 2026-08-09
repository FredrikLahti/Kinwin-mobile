import { forwardRef } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardTypeOptions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

const NUMERIC_ACCESSORY_ID = 'kinwin-numeric-done';

// These iOS keyboard types have no return key of any kind, so without this
// toolbar there is no way to dismiss them intentionally at all.
const KEYBOARD_TYPES_WITHOUT_RETURN_KEY = new Set<KeyboardTypeOptions>(['number-pad', 'decimal-pad', 'phone-pad']);

// The single reusable Kinwin text input: always uses the dark iOS keyboard
// appearance, and — for normal single-line fields — defaults to a "Done"
// return key that dismisses the keyboard rather than silently doing
// nothing or advancing the screen. Multiline fields keep their return key
// free for line breaks. Numeric keypads that have no return key at all get
// a small dark "Done" accessory bar instead. Any of this can still be
// overridden per field by passing returnKeyType/onSubmitEditing explicitly.
export const TextInputV2 = forwardRef<TextInput, TextInputProps>(function TextInputV2(
  { keyboardType, multiline, onSubmitEditing, returnKeyType, ...rest },
  ref,
) {
  const needsAccessory = Platform.OS === 'ios' && !multiline
    && keyboardType !== undefined && KEYBOARD_TYPES_WITHOUT_RETURN_KEY.has(keyboardType);

  return (
    <>
      <TextInput
        {...rest}
        inputAccessoryViewID={needsAccessory ? NUMERIC_ACCESSORY_ID : undefined}
        keyboardAppearance="dark"
        keyboardType={keyboardType}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing ?? (multiline ? undefined : () => Keyboard.dismiss())}
        ref={ref}
        returnKeyType={returnKeyType ?? (multiline ? undefined : 'done')}
      />
      {needsAccessory && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.accessory}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryButtonText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: theme.colors.structureLine,
  },
  accessoryButton: { minHeight: 32, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  accessoryButtonText: { color: theme.colors.rosewood, fontSize: 16, fontWeight: '700' },
});
