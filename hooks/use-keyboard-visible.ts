import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the on-screen keyboard is currently showing. Used to hide
 * keyboard-dismiss UI ("Done") the rest of the time, instead of it sitting
 * there permanently as if it were an alternative save action. iOS gets the
 * "Will" events for a snappier feel; Android only reliably emits the
 * non-"Will" ones. On web, Keyboard.addListener is a documented no-op that
 * never fires, so this stays false — correct, since there is no on-screen
 * keyboard to dismiss there.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return visible;
}
