export declare const UPDATABLE_TRIP_FIELDS: string[];
export declare const CREATE_TRIP_EXTRA_FIELDS: string[];

export type FieldResult =
  | { value: unknown; error?: undefined }
  | { error: string; value?: undefined };

export declare function validateTripField(key: string, value: unknown): FieldResult | null;

export declare function collectTripFields(
  body: Record<string, unknown>,
  fields: string[],
): { value: Record<string, unknown>; error?: undefined } | { error: string; value?: undefined };
