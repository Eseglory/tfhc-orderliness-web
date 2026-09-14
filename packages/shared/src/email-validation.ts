/**
 * Centralized, strict email validation and normalization.
 * Enforces RFC 5322 compliance, normalization, and rejects fake/placeholder/example domains
 * to protect against undeliverable email dispatches.
 */

export interface EmailValidationResult {
  isValid: boolean;
  normalizedEmail: string;
  reason?: string;
  isExampleOrTest?: boolean;
}

// RFC 2606 and RFC 6761 reserved domains and TLDs
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost', 'local', 'internal', 'onion']);

const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'sample.com',
  'sample.org',
  'sample.net',
  'test.com',
  'test.org',
  'test.net',
  'foo.com',
  'bar.com',
  'baz.com',
  'qux.com',
  'foobar.com',
  'dummy.com',
  'fake.com',
  'fakemail.com',
  'nowhere.com',
]);

// Known disposable and temporary email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'trashmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'getairmail.com',
  'generator.email',
  'trashmail.net',
]);

const PLACEHOLDER_LOCAL_PARTS = new Set([
  'test',
  'testing',
  'dummy',
  'fake',
  'sample',
  'placeholder',
  'foo',
  'bar',
  'baz',
  'qux',
  'nobody',
  'nowhere',
  'none',
  'null',
  'undefined',
]);

/**
 * Normalizes an email address by trimming whitespace and lowercasing.
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  let cleaned = email.trim();
  // Strip enclosing angle brackets if present: "<user@domain.com>" -> "user@domain.com"
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.toLowerCase();
}

/**
 * Validates an email address against syntax, RFC rules, and placeholder domain blacklists.
 */
export function validateEmail(
  email: unknown,
  options: { allowTestDomains?: boolean } = {},
): EmailValidationResult {
  if (typeof email !== 'string' || !email.trim()) {
    return { isValid: false, normalizedEmail: '', reason: 'Email is required and cannot be empty' };
  }

  const raw = email.trim();
  // Check max RFC length (254 characters)
  if (raw.length > 254) {
    return { isValid: false, normalizedEmail: '', reason: 'Email exceeds maximum allowed length (254 characters)' };
  }

  // Check for header injection attempts (newlines, carriage returns)
  if (/[\r\n\0]/.test(raw)) {
    return { isValid: false, normalizedEmail: '', reason: 'Email contains illegal newline or control characters' };
  }

  const normalized = normalizeEmail(raw);

  // Must contain exactly one '@'
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      reason: parts.length < 2 ? 'Missing @ symbol' : 'Contains multiple @ symbols',
    };
  }

  const [localPart, domainPart] = parts;

  // Local part validation
  if (!localPart) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Missing username/local part before @' };
  }
  if (localPart.length > 64) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Local part exceeds 64 characters' };
  }
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Local part cannot start or end with a dot' };
  }
  if (localPart.includes('..')) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Local part cannot contain consecutive dots' };
  }
  // Valid characters for unquoted local part
  const localPartRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  if (!localPartRegex.test(localPart)) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Local part contains invalid characters' };
  }

  // Domain part validation
  if (!domainPart) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Missing domain part after @' };
  }
  if (domainPart.length > 253) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Domain exceeds maximum length of 253 characters' };
  }
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Domain cannot start or end with a dot' };
  }
  if (domainPart.includes('..')) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Domain cannot contain consecutive dots' };
  }

  const domainLabels = domainPart.split('.');
  if (domainLabels.length < 2) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Domain must contain at least one dot and a valid TLD' };
  }

  // Validate each domain label
  for (const label of domainLabels) {
    if (!label) {
      return { isValid: false, normalizedEmail: normalized, reason: 'Domain contains empty label' };
    }
    if (label.length > 63) {
      return { isValid: false, normalizedEmail: normalized, reason: 'Domain label exceeds 63 characters' };
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return { isValid: false, normalizedEmail: normalized, reason: 'Domain label cannot start or end with a hyphen' };
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return { isValid: false, normalizedEmail: normalized, reason: 'Domain contains invalid characters' };
    }
  }

  // Validate TLD (last label)
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) {
    return { isValid: false, normalizedEmail: normalized, reason: 'Domain TLD must consist of at least 2 letters' };
  }

  // Check reserved TLDs
  if (RESERVED_TLDS.has(tld)) {
    if (!options.allowTestDomains) {
      return {
        isValid: false,
        normalizedEmail: normalized,
        isExampleOrTest: true,
        reason: `Domain uses reserved test/example TLD (.${tld})`,
      };
    }
  }

  // Check reserved / example domains
  if (RESERVED_DOMAINS.has(domainPart)) {
    if (!options.allowTestDomains) {
      return {
        isValid: false,
        normalizedEmail: normalized,
        isExampleOrTest: true,
        reason: `Domain '${domainPart}' is a reserved placeholder/example domain`,
      };
    }
  }

  // Check disposable / temp email domains
  if (DISPOSABLE_DOMAINS.has(domainPart)) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      reason: `Domain '${domainPart}' is a disposable/temporary email provider`,
    };
  }

  // Check obvious placeholder local parts on generic domains
  if (PLACEHOLDER_LOCAL_PARTS.has(localPart) && (domainPart.includes('test') || domainPart.includes('sample') || domainPart.includes('example'))) {
    if (!options.allowTestDomains) {
      return {
        isValid: false,
        normalizedEmail: normalized,
        isExampleOrTest: true,
        reason: `Address '${normalized}' is an obvious test/placeholder address`,
      };
    }
  }

  return { isValid: true, normalizedEmail: normalized };
}

/**
 * Returns boolean whether email is valid and deliverable.
 */
export function isValidEmail(email: unknown, options?: { allowTestDomains?: boolean }): boolean {
  return validateEmail(email, options).isValid;
}

/**
 * Asserts that an email is deliverable and valid. Throws Error if not.
 */
export function assertValidDeliverableEmail(email: unknown, context = 'Email recipient'): string {
  const result = validateEmail(email);
  if (!result.isValid) {
    throw new Error(`[EMAIL_VALIDATION_ERROR] ${context} is invalid: ${result.reason} (received: '${String(email)}')`);
  }
  return result.normalizedEmail;
}
