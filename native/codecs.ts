import {
  DynamicCodec as InternalDynamicCodec,
  JsonCodec as InternalJsonCodec,
  VariantCodec,
} from "./codecs/dynamic.ts";
import { getCodec, createCodec } from "./codecs/registry.ts";

export {
  asBytes,
  BaseCodec,
  childState,
  defaultDeserializerState,
  escapeString,
  extractTypeArgs,
  nullToLiteral,
  parseTupleElements,
  parseTypeList,
  readKinds1,
  readKinds2,
  readKindsMany,
  SQL_NULL,
  wrapQuoted,
} from "./codecs/base.ts";
export type { Codec } from "./codecs/base.ts";

export {
  ArrayCodec,
  LowCardinalityCodec,
  MapCodec,
  NullableCodec,
  TupleCodec,
} from "./codecs/composite.ts";
export type { CodecResolver } from "./codecs/dynamic.ts";
export { VariantCodec, createCodec, getCodec };
export {
  BigIntCodec,
  DateTime64Codec,
  DecimalCodec,
  EnumCodec,
  EpochCodec,
  FixedStringCodec,
  IPv4Codec,
  IPv6Codec,
  NumericCodec,
  StringCodec,
  UUIDCodec,
} from "./codecs/scalar.ts";

export {
  toBigInt,
  toInt16,
  toInt32,
  toInt64,
  toInt8,
  toNumber,
  toUInt16,
  toUInt32,
  toUInt64,
  toUInt8,
} from "./coercion.ts";

export class DynamicCodec extends InternalDynamicCodec {
  constructor() {
    super(getCodec);
  }
}

export class JsonCodec extends InternalJsonCodec {
  constructor(typedPaths: { name: string; type: string }[] = []) {
    super(getCodec, typedPaths);
  }
}
