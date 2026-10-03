// Substitute standard direct diffuse/specular for split grass/litter transmission.
#undef RE_Direct
#define RE_Direct RE_Direct_Physical
