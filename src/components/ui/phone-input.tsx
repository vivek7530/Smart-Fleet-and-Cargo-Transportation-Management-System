'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { PHONE_LENGTH, clampPhoneInput, phoneInputProps } from '@/lib/phone';

/**
 * The one mobile-number field in the product.
 *
 * It carries the numeric keyboard, the autofill hint and the ten-digit cap,
 * and it cleans the value as it is typed: letters and punctuation never land
 * in the box, a pasted `+91 98334 40021` collapses to its ten digits, and an
 * eleventh digit is simply not accepted. Whatever reaches the form state is
 * therefore already in the shape `optionalPhoneField` expects, so the error
 * message below the field is reserved for a genuinely short number.
 *
 * It spreads `react-hook-form`'s `register()` unchanged — the sanitised value
 * is written back to the element before the form's own `onChange` sees it.
 */
const PhoneInput = React.forwardRef<HTMLInputElement, InputProps>(({ onChange, ...props }, ref) => (
  <Input
    {...phoneInputProps}
    startIcon={<span className="text-sm font-medium tabular">+91</span>}
    {...props}
    className={props.className ? `pl-12 ${props.className}` : 'pl-12'}
    ref={ref}
    onChange={(event) => {
      const cleaned = clampPhoneInput(event.target.value);
      if (event.target.value !== cleaned) {
        // Rewriting the element keeps the caret at the end of real input and
        // stops a rejected keystroke from ever being shown.
        event.target.value = cleaned;
      }
      onChange?.(event);
    }}
  />
));
PhoneInput.displayName = 'PhoneInput';

export { PhoneInput, PHONE_LENGTH };
