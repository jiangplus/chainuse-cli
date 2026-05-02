// Error codes for Chainuse

export enum ErrorCode {
  // User errors (exit 1)
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_CHAIN = 'INVALID_CHAIN',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  ALIAS_NOT_FOUND = 'ALIAS_NOT_FOUND',
  ALIAS_EXISTS = 'ALIAS_EXISTS',
  TX_NOT_FOUND = 'TX_NOT_FOUND',
  TX_WRONG_STATUS = 'TX_WRONG_STATUS',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',
  INVALID_ABI = 'INVALID_ABI',
  KEYSTORE_LOCKED = 'KEYSTORE_LOCKED',
  INVALID_PASSPHRASE = 'INVALID_PASSPHRASE',
  ALREADY_INITIALIZED = 'ALREADY_INITIALIZED',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  IMPORT_FAILED = 'IMPORT_FAILED',

  // Policy denial (exit 2)
  POLICY_DENIED = 'POLICY_DENIED',

  // Provider/network errors (exit 3)
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',

  // Signing errors (exit 4)
  SIGNING_ERROR = 'SIGNING_ERROR',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export function exitCodeFor(code: string): number {
  if (
    code === ErrorCode.POLICY_DENIED
  ) return 2

  if (
    code === ErrorCode.PROVIDER_ERROR ||
    code === ErrorCode.NETWORK_ERROR ||
    code === ErrorCode.RPC_ERROR ||
    code === ErrorCode.SIMULATION_FAILED ||
    code === ErrorCode.GAS_ESTIMATION_FAILED
  ) return 3

  if (
    code === ErrorCode.SIGNING_ERROR ||
    code === ErrorCode.DECRYPTION_FAILED
  ) return 4

  return 1
}
