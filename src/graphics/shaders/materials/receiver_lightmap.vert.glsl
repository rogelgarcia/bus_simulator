uniform highp sampler2D receiverAtlasMapping;
uniform int receiverAtlasEnabled;
attribute float receiverAtlasVertex;
#ifdef USE_INSTANCING
attribute float receiverAtlasInstance;
#endif
varying highp vec4 vReceiverAtlas;

void receiverAtlasTransfer() {
    if (receiverAtlasEnabled == 0) { vReceiverAtlas = vec4(0.0); return; }
    int index = int(receiverAtlasVertex);
    #ifdef USE_INSTANCING
    if (index > 0) index += int(receiverAtlasInstance);
    #endif
    ivec2 size = textureSize(receiverAtlasMapping, 0);
    vReceiverAtlas = texelFetch(receiverAtlasMapping, ivec2(index % size.x, index / size.x), 0);
}
