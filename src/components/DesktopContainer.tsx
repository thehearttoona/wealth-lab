import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useResponsive } from '../utils/responsive';
import { COLORS } from '../utils/constants';

interface DesktopContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
  noPadding?: boolean;
}

export default function DesktopContainer({ children, maxWidth, noPadding }: DesktopContainerProps) {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const effectiveMaxWidth = maxWidth || contentMaxWidth;

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.outerContainer, noPadding && { paddingHorizontal: 0 }]}>
      <View style={[styles.innerContainer, { maxWidth: effectiveMaxWidth }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  innerContainer: {
    flex: 1,
    width: '100%',
  },
});
