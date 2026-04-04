import * as React from 'react';
import { cn } from '../../lib/utils';

const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    ref={ref}
    className={cn(
      'h-4 w-4 shrink-0 rounded border-sky-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0',
      className
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
