import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';

const Icon = ({ value, color }: { value: string; color: string }) => (
  <Text aria-hidden style={{ color, fontSize: 18 }}>{value}</Text>
);

export default function SocialPreviewTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.copperBright,
        tabBarInactiveTintColor: theme.colors.warmGrey,
        tabBarStyle: {
          height: 68,
          paddingTop: 7,
          paddingBottom: 8,
          backgroundColor: theme.colors.deepInk,
          borderTopColor: theme.colors.structureLineStrong,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kin feed',
          tabBarAccessibilityLabel: 'Kin feed',
          tabBarIcon: ({ color }) => <Icon color={color} value="◈" />,
        }}
      />
      <Tabs.Screen
        name="my-kin"
        options={{
          title: 'My Kin',
          tabBarAccessibilityLabel: 'My Kin',
          tabBarIcon: ({ color }) => <Icon color={color} value="◎" />,
        }}
      />
    </Tabs>
  );
}
