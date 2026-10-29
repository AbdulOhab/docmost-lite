export const AUTH_THROTTLER = 'auth';

// Every named throttler must appear here; spread it in @SkipThrottle and re-enable per name with false.
export const ALL_NAMED_THROTTLERS_SKIPPED: Record<string, boolean> = {
  [AUTH_THROTTLER]: true,
};
