import { Feather } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarV2 } from '@/components/v2/avatar';
import { PreviewTagV2 } from '@/components/v2/preview-tag';
import { SegmentedControlV2 } from '@/components/v2/segmented-control';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { demoKinActivity, demoKinPeople } from '@/fixtures/ux-v2-preview';
import { playSelectionHaptic } from '@/lib/haptics';

type Tab = 'activity' | 'people';

export default function KinV2() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('activity');
  const [reacted, setReacted] = useState<Record<string, boolean>>({});

  const toggleReaction = (id: string) => {
    void playSelectionHaptic();
    setReacted((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>KIN</Text>
          <Pressable
            accessibilityHint="Switches to the People list"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => { void playSelectionHaptic(); setTab('people'); }}
            style={({ pressed }) => [styles.addAction, pressed && styles.addActionPressed]}
          >
            <Feather color={theme.colors.crimsonBright} name="user-plus" size={18} />
          </Pressable>
        </View>

        <PreviewTagV2 />

        <View style={styles.segmented}>
          <SegmentedControlV2
            onChange={setTab}
            options={[{ label: 'Activity', value: 'activity' }, { label: 'People', value: 'people' }]}
            value={tab}
          />
        </View>

        {tab === 'activity' ? (
          <View style={styles.list}>
            {demoKinActivity.map((item) => (
              <View key={item.id} style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <AvatarV2 size={40} />
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityName}>{item.name}</Text>
                    <Text style={styles.activityBehavior}>{item.behavior}</Text>
                  </View>
                  {item.detail && <Text style={styles.activityDetail}>{item.detail}</Text>}
                </View>
                <Text style={styles.activityEvent}>{item.event}</Text>
                <View style={styles.activityActions}>
                  <Pressable
                    accessibilityHint="Reacts to this event"
                    accessibilityRole="button"
                    accessibilityState={{ selected: Boolean(reacted[item.id]) }}
                    onPress={() => toggleReaction(item.id)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      reacted[item.id] && styles.actionButtonActive,
                      pressed && styles.actionButtonPressed,
                    ]}
                  >
                    <Text style={[styles.actionLabel, reacted[item.id] && styles.actionLabelActive]}>
                      {reacted[item.id] ? 'Reacted' : 'React'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint="Opens comments"
                    accessibilityRole="button"
                    onPress={() => router.push('/home/coming-soon?title=Comments' as Href)}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  >
                    <Text style={styles.actionLabel}>Comment</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            <View style={styles.rowGroup}>
              {demoKinPeople.map((person) => (
                <View key={person.id} style={styles.personRow}>
                  <AvatarV2 size={40} />
                  <Text style={styles.personName}>{person.name}</Text>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityHint="Opens adding a new Kin"
              accessibilityRole="button"
              onPress={() => router.push('/home/coming-soon?title=Add Kin' as Href)}
              style={({ pressed }) => [styles.addKinButton, pressed && styles.addKinButtonPressed]}
            >
              <Feather color={theme.colors.crimsonBright} name="user-plus" size={16} />
              <Text style={styles.addKinLabel}>Add Kin</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.small, gap: theme.spacing.xsmall,
  },
  header: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  addAction: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
  },
  addActionPressed: { backgroundColor: theme.colors.surfaceRaised },
  segmented: { marginTop: 4 },
  list: { marginTop: theme.spacing.small, gap: theme.spacing.small },
  activityCard: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.small, gap: 8,
  },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityCopy: { flex: 1 },
  activityName: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  activityBehavior: { color: theme.colors.ivoryMuted, fontSize: 12 },
  activityDetail: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  activityEvent: { color: theme.colors.ivoryMuted, fontSize: 13 },
  activityActions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.precise, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised,
  },
  actionButtonActive: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  actionButtonPressed: { opacity: 0.75 },
  actionLabel: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '700' },
  actionLabelActive: { color: theme.colors.crimsonBright },
  rowGroup: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  personRow: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  personName: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  addKinButton: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.crimson,
    backgroundColor: theme.colors.crimsonSurface,
  },
  addKinButtonPressed: { opacity: 0.85 },
  addKinLabel: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
});
