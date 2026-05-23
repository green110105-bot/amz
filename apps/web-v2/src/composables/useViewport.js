import { useMediaQuery } from '@vueuse/core';
import { computed } from 'vue';

export function useViewport() {
  const isMobile  = useMediaQuery('(max-width: 767px)');
  const isTablet  = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTouch   = useMediaQuery('(hover: none) and (pointer: coarse)');
  const breakpoint = computed(() => {
    if (isMobile.value) return 'mobile';
    if (isTablet.value) return 'tablet';
    return 'desktop';
  });
  return { isMobile, isTablet, isDesktop, isTouch, breakpoint };
}
