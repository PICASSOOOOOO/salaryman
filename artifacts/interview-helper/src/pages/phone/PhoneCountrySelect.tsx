import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/max';
import { useMemo } from 'react';
import { slate } from '@/lib/phone-utils';

const displayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export const PHONE_COUNTRIES = getCountries()
  .map(iso => ({
    iso,
    name: displayNames?.of(iso) || iso,
    dialCode: getCountryCallingCode(iso),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function PhoneCountrySelect({
  value,
  onChange,
  compact = false,
}: {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
  compact?: boolean;
}) {
  const options = useMemo(() => PHONE_COUNTRIES, []);
  return (
    <select
      aria-label="Phone country"
      value={value}
      onChange={event => onChange(event.target.value as CountryCode)}
      style={{
        width: compact ? 126 : '100%',
        minWidth: 0,
        background: slate(0.03),
        border: `1px solid ${slate(0.15)}`,
        borderRadius: 6,
        padding: compact ? '8px 7px' : '9px 10px',
        color: slate(0.85),
        fontSize: '0.52rem',
      }}
    >
      {options.map(country => (
        <option key={country.iso} value={country.iso}>
          {country.iso} +{country.dialCode} · {country.name}
        </option>
      ))}
    </select>
  );
}