/**
 * Minimal Thrift binary protocol decoder for X Chat encoded message events.
 *
 * X Chat events are base64-encoded Thrift binary structs. This module
 * decodes the top-level metadata fields without attempting to decrypt
 * the end-to-end encrypted message content.
 *
 * @see https://github.com/apache/thrift/blob/master/doc/specs/thrift-binary-protocol.md
 */

// Thrift binary protocol type IDs
const enum ThriftType {
  Stop = 0,
  Bool = 2,
  Byte = 3,
  I16 = 6,
  I32 = 8,
  I64 = 10,
  String = 11,
  Struct = 12,
  Map = 13,
  Set = 14,
  List = 15,
}

/** Header of a Thrift struct field (type tag + field ID). */
interface ThriftFieldHeader {
  type: number;
  fieldId: number;
}

/**
 * Low-level Thrift binary protocol reader.
 * Reads primitives from a byte buffer with a moving offset.
 */
class ThriftReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  /** Number of bytes remaining in the buffer. */
  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  /** Read a single unsigned byte and advance the offset. */
  readByte(): number {
    return this.view.getUint8(this.offset++);
  }

  /** Read a signed 16-bit big-endian integer. */
  readI16(): number {
    const val = this.view.getInt16(this.offset);
    this.offset += 2;
    return val;
  }

  /** Read a signed 32-bit big-endian integer. */
  readI32(): number {
    const val = this.view.getInt32(this.offset);
    this.offset += 4;
    return val;
  }

  /** Read a 64-bit integer as a decimal string (avoids precision loss). */
  readI64AsString(): string {
    // Read as unsigned halves to correctly combine into a 64-bit value
    const hi = this.view.getUint32(this.offset);
    const lo = this.view.getUint32(this.offset + 4);
    this.offset += 8;
    if (hi === 0) return lo.toString();
    return (BigInt(hi) * BigInt(4294967296) + BigInt(lo)).toString();
  }

  /** Read a length-prefixed UTF-8 string. */
  readString(): string {
    const len = this.readI32();
    const str = new TextDecoder().decode(
      this.bytes.slice(this.offset, this.offset + len),
    );
    this.offset += len;
    return str;
  }

  /** Read a length-prefixed binary blob. */
  readBinary(): Uint8Array {
    const len = this.readI32();
    const data = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return data;
  }

  /**
   * Skip over a field value of the given type without parsing it.
   */
  skip(type: number): void {
    switch (type) {
      case ThriftType.Bool:
      case ThriftType.Byte:
        this.offset += 1;
        break;
      case ThriftType.I16:
        this.offset += 2;
        break;
      case ThriftType.I32:
        this.offset += 4;
        break;
      case ThriftType.I64:
        this.offset += 8;
        break;
      case ThriftType.String: {
        const len = this.readI32();
        this.offset += len;
        break;
      }
      case ThriftType.Struct:
        this.skipRemainingFields();
        break;
      case ThriftType.Map: {
        const keyType = this.readByte();
        const valType = this.readByte();
        const size = this.readI32();
        for (let i = 0; i < size; i++) {
          this.skip(keyType);
          this.skip(valType);
        }
        break;
      }
      case ThriftType.Set:
      case ThriftType.List: {
        const elemType = this.readByte();
        const size = this.readI32();
        for (let i = 0; i < size; i++) {
          this.skip(elemType);
        }
        break;
      }
      default:
        throw new Error(`Cannot skip unknown Thrift type: ${type}`);
    }
  }

  /**
   * Skip all remaining fields in the current struct until the STOP marker.
   * Call this after you have finished reading the fields you care about.
   */
  skipRemainingFields(): void {
    let header = this.readFieldHeader();
    while (header !== null) {
      this.skip(header.type);
      header = this.readFieldHeader();
    }
  }

  /**
   * Read the next field header (type + field ID).
   * Returns null if the STOP marker is reached.
   */
  readFieldHeader(): ThriftFieldHeader | null {
    if (this.remaining <= 0) return null;
    const type = this.readByte();
    if (type === ThriftType.Stop) return null;
    const fieldId = this.readI16();
    return { type, fieldId };
  }
}

// ─── X Chat Event Types ──────────────────────────────────────────────

/** Types of events that can appear in X Chat encoded messages. */
export const enum XChatEventType {
  /** A text message (content is E2E encrypted). */
  Message = 'message',
  /** A conversation-read receipt. */
  ReadReceipt = 'read_receipt',
  /** A key-exchange event for E2E encryption setup. */
  KeyChange = 'key_change',
  /** Unrecognized event structure. */
  Unknown = 'unknown',
}

/**
 * Metadata extracted from a Thrift-encoded X Chat event.
 * The actual message text is end-to-end encrypted and cannot
 * be decrypted without the user's X Chat PIN-derived keys.
 */
export interface XChatDecodedEvent {
  /** Snowflake-like event ID. */
  eventId: string;
  /** UUID identifying this event. */
  uuid: string;
  /** User ID of the sender. */
  senderId: string;
  /** Conversation ID (format: "userId1:userId2"). */
  conversationId: string;
  /** Timestamp in milliseconds since epoch. */
  timestampMs: string;
  /** Classified event type. */
  eventType: XChatEventType;
  /** For read receipts: the event ID that was marked as read. */
  readEventId?: string;
  /** The raw base64-encoded event, preserved for potential future decryption. */
  rawEncoded: string;
}

/**
 * Decode a base64-encoded Thrift binary X Chat event into its metadata fields.
 *
 * The event structure (as Thrift binary):
 * ```
 * struct XChatEvent {
 *   1: string event_id
 *   2: string uuid
 *   3: string sender_id
 *   4: string conversation_id
 *   5: string jwt_token
 *   6: string timestamp_ms
 *   7: struct event_data     // message content (encrypted), read receipt, or key change
 *   8: i32   event_flag
 *   9: struct encryption_meta // ECDH keys and encrypted payloads
 * }
 * ```
 */
export function decodeXChatEvent(base64Encoded: string): XChatDecodedEvent {
  const binaryString = atob(base64Encoded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const reader = new ThriftReader(bytes);
  let eventId = '';
  let uuid = '';
  let senderId = '';
  let conversationId = '';
  let timestampMs = '';
  let eventType: XChatEventType = XChatEventType.Unknown;
  let readEventId: string | undefined;

  let header = reader.readFieldHeader();
  while (header !== null) {
    const { type, fieldId } = header;

    switch (fieldId) {
      case 1: // event_id
        eventId = reader.readString();
        break;
      case 2: // uuid
        uuid = reader.readString();
        break;
      case 3: // sender_id
        senderId = reader.readString();
        break;
      case 4: // conversation_id
        conversationId = reader.readString();
        break;
      case 5: // jwt_token (skip — not needed for metadata)
        reader.skip(type);
        break;
      case 6: // timestamp_ms
        timestampMs = reader.readString();
        break;
      case 7: // event_data — classify the event type
        ({ eventType, readEventId } = classifyEventData(reader));
        break;
      default:
        reader.skip(type);
        break;
    }

    header = reader.readFieldHeader();
  }

  return {
    eventId,
    uuid,
    senderId,
    conversationId,
    timestampMs,
    eventType,
    readEventId,
    rawEncoded: base64Encoded,
  };
}

/** Result of classifying an X Chat event_data struct. */
interface EventClassification {
  eventType: XChatEventType;
  readEventId?: string;
}

/**
 * Classify the event type by peeking into the event_data struct (field 7).
 *
 * Heuristic based on observed Thrift field IDs:
 * - field_12 present → read receipt
 * - field_1 is a struct with field_100 → encrypted message
 * - field_1 is a string (user ID) → key change event
 */
function classifyEventData(reader: ThriftReader): EventClassification {
  let header = reader.readFieldHeader();
  while (header !== null) {
    const { type, fieldId } = header;

    // Read receipt: field_12 is a struct containing { 1: event_id, 2: timestamp }
    if (fieldId === 12 && type === ThriftType.Struct) {
      const readEventId = readReadReceiptEventId(reader);
      reader.skipRemainingFields();
      return { eventType: XChatEventType.ReadReceipt, readEventId };
    }

    // Message or key-change: field_1 as a nested struct
    if (fieldId === 1 && type === ThriftType.Struct) {
      const eventType = classifyField1Struct(reader);
      reader.skipRemainingFields();
      return { eventType };
    }

    // Key change: field_1 or field_3 as a plain string
    if ((fieldId === 1 || fieldId === 3) && type === ThriftType.String) {
      reader.skip(type);
      reader.skipRemainingFields();
      return { eventType: XChatEventType.KeyChange };
    }

    reader.skip(type);
    header = reader.readFieldHeader();
  }

  return { eventType: XChatEventType.Unknown };
}

/**
 * Read the event_id from a read-receipt inner struct, then skip the rest.
 * The struct is expected to contain: { 1: string event_id, 2: string timestamp }.
 */
function readReadReceiptEventId(reader: ThriftReader): string | undefined {
  const inner = reader.readFieldHeader();
  if (!inner) return undefined;

  let readEventId: string | undefined;
  if (inner.fieldId === 1) {
    readEventId = reader.readString();
  } else {
    reader.skip(inner.type);
  }

  reader.skipRemainingFields();
  return readEventId;
}

/**
 * Peek at the first field inside a field_1 struct to distinguish
 * encrypted messages (field_100 present) from key-change events.
 */
function classifyField1Struct(reader: ThriftReader): XChatEventType {
  const inner = reader.readFieldHeader();
  if (!inner) return XChatEventType.Unknown;

  const eventType =
    inner.fieldId === 100 ? XChatEventType.Message : XChatEventType.KeyChange;

  reader.skip(inner.type);
  reader.skipRemainingFields();
  return eventType;
}
