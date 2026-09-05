uniform highp sampler2D receiverAtlasMapping;
uniform int receiverAtlasEnabled;
attribute vec4 receiverAtlasCoordinate;
attribute float receiverAtlasVertex;
#ifdef USE_INSTANCING
attribute float receiverAtlasInstance;
#endif
varying highp vec4 vReceiverAtlas;
void receiverAtlasTransfer() {
    vReceiverAtlas = vec4(0.0);
    if (receiverAtlasEnabled == 0) return;
    #ifdef USE_INSTANCING
    int index = int(receiverAtlasVertex);
    if (index > 0) index += int(receiverAtlasInstance);
    ivec2 size = textureSize(receiverAtlasMapping, 0);
    vReceiverAtlas = texelFetch(receiverAtlasMapping, ivec2(index % size.x, index / size.x), 0);
    #else
    vReceiverAtlas = receiverAtlasCoordinate;
    #endif
}
