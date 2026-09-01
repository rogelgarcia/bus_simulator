// Declares the stable AI 530 binary transport vocabulary and safety limits.
// @ts-check

export const ILLUMINATION_PACKAGE_MAGIC = 'ILPKG001';
export const ILLUMINATION_PACKAGE_VERSION = Object.freeze({ major: 1, minor: 0 });
export const ILLUMINATION_PACKAGE_ENDIAN_MARKER = 0x01020304;
export const ILLUMINATION_PACKAGE_HEADER_LENGTH = 208;
export const ILLUMINATION_PACKAGE_ALIGNMENT = 16;
export const ILLUMINATION_PACKAGE_SCHEMA = 'bus-sim-illumination-package-manifest-v1';
export const ILLUMINATION_CHUNK_TABLE_SCHEMA = 'bus-sim-illumination-chunk-table-v1';
export const ILLUMINATION_CAPABILITY_PROFILE_SCHEMA = 'bus-sim-illumination-capability-profile-v1';
export const ILLUMINATION_CHANNEL_SCHEMA_VERSION = 1;
export const ILLUMINATION_HASH_ALGORITHM = 'sha256';
export const ILLUMINATION_BYTE_ORDER = 'little_endian';
export const ILLUMINATION_PADDING_POLICY = 'zero_fill_16_byte_alignment_v1';
export const ILLUMINATION_COMPRESSION_POLICY = 'independent_chunks_none_required_v1';
export const ILLUMINATION_MIP_POLICY = 'explicit_levels_only_no_runtime_generation_v1';
export const ILLUMINATION_UNKNOWN_OPTIONAL_POLICY = 'skip_unknown_optional_v1';
export const ILLUMINATION_KNOWN_CHANNELS = Object.freeze([
    'direct_receiver',
    'indirect_irradiance',
    'receiver_mapping',
    'static_ao_bent_normal',
    'static_sun_depth'
]);
export const ILLUMINATION_SUPPORTED_ENCODINGS = Object.freeze([
    'raw_u8',
    'r8_unorm',
    'rg8_unorm',
    'rgba8_unorm',
    'rgba16f_le',
    'rgba32f_le',
    'uint32_le'
]);
export const ILLUMINATION_SUPPORTED_COMPRESSION = Object.freeze(['none']);
export const ILLUMINATION_MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
export const ILLUMINATION_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const ILLUMINATION_MAX_CHUNKS = 65535;
export const ILLUMINATION_AGGREGATE_HASH_OFFSET = 168;
export const ILLUMINATION_AGGREGATE_HASH_LENGTH = 32;

export const ILLUMINATION_HEADER_OFFSETS = Object.freeze({
    magic: 0,
    major: 8,
    minor: 10,
    endianMarker: 12,
    headerLength: 16,
    manifestOffset: 20,
    manifestLength: 24,
    tableOffset: 28,
    tableLength: 32,
    payloadOffset: 36,
    payloadLength: 40,
    fileLength: 44,
    alignment: 48,
    flags: 52,
    chunkCount: 56,
    profileCount: 60,
    channelCount: 64,
    reserved: 68,
    manifestSha256: 72,
    tableSha256: 104,
    payloadSha256: 136,
    aggregateSha256: ILLUMINATION_AGGREGATE_HASH_OFFSET
});
