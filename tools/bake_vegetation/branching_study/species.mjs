// Botanical evidence and editable numeric starting points; no executable species hooks.
const source=(label,url)=>Object.freeze({label,url});
const nc=(slug)=>source('NC State Extension',`https://plants.ces.ncsu.edu/plants/${slug}/`);
const context={contextStrength:1,nodeSpacing:.32,forkAsymmetry:.4,maximumSlenderness:110,supportedSlenderness:90,junctionBlend:.24,
    depth:6,minChildren:3,maxChildren:4,orderLengthScale:.94,terminalLengthScale:.76,terminalBendScale:.2,leaderBendScale:.18};
const record=value=>Object.freeze({...value,parameters:Object.freeze({...context,...value.parameters}),sources:Object.freeze(value.sources)});
export const species=Object.freeze({
    london_plane:record({
        spatialParameters:{baseDiameter:.75,ramificationOutward:.16,primaryApicalScale:.7,trunkBend:18,trunkBendSpread:1,trunkBendRecovery:.55,trunkBendVariation:.25},
        name:'London plane',botanical:'Platanus × acerifolia',habit:'Open, spreading mature crown',
        size:'Typical mature context: 21–30 m tall; 18–23 m wide.',
        structure:'Young crowns are more pyramidal; mature crowns spread and open. Alternate nodes and mildly zigzag young shoots.',
        surface:'Large palmate leaves with 3–5 lobes; exfoliating mottled bark.',
        mapping:'Distributed primary limbs subdivide through six daughter-fork tiers, with smaller intermediate branches.',
        limitation:'A planar mature architecture study; no age transition, radial azimuth or mottled bark surface.',
        sources:[nc('platanus-x-acerifolia')],
        parameters:{trunkLength:4,baseDiameter:1.2,architecture:'mixed',primaryLimbs:7,forkAngle:80,continuationAngle:7,
            depth:1,ramificationLevels:6,ramificationRatio:.7,ramificationAngle:42,ramificationSideBuds:.45,ramificationOutward:.3,forkAsymmetry:.2,minChildren:4,maxChildren:4,minimumLength:.06,
            mainRatio:.87,lateralRatio:.86,bend:20,bendBias:.1,scaffoldBias:.25,bendCenter:.55,bendSpread:.45,bendRecovery:.15,
            branchStart:.28,trunkClearance:.48,lowerLengthScale:1.3,upperLengthScale:.75,upperAngleScale:.75,crownHeight:22,forkChance:.65,
            angleVariation:8,lengthVariation:.12,lean:1,tilt:0,budSurvival:.9,radiusLoss:.25,leaderLoss:.04,taper:.2,
            rootReach:9,rootDepth:1.5,rootCount:6,rootBaseRatio:.65,rootFlare:1}
    }),
    silver_linden:record({
        spatialParameters:{leaderLaterals:4,mainRatio:.6,crownHeight:13.5,lowerLengthScale:1.15,upperLengthScale:.25,ramificationRatio:.7,ramificationSideBuds:.45,trunkBend:14,trunkBendSpread:1,trunkBendRecovery:.55,trunkBendVariation:.25},
        name:'Silver linden',botanical:'Tilia tomentosa',habit:'Broad pyramid with ascending limbs',
        size:'Typical mature context: 15–21 m tall; 9–15 m wide (NC State).',
        structure:'Dense broad-pyramidal crown with erect branches. A single leader is the recommended trained structure; older branches can droop.',
        surface:'Alternate heart-shaped, toothed leaves with pale fuzzy undersides; bark becomes ridged with age.',
        mapping:'Persistent central leader with spreading lower scaffolds and progressively shorter, steeper upper laterals.',
        limitation:'Height profiles are artistic estimates. Crown density is not a measured leaf count or resource simulation.',
        sources:[nc('tilia-tomentosa'),source('UF/IFAS tree fact sheet','https://hort.ifas.ufl.edu/trees/TILTOMA.pdf')],
        parameters:{depth:3,ramificationLevels:4,ramificationRatio:.67,ramificationAngle:29,ramificationSideBuds:.65,minimumLength:.06,
            trunkLength:5.5,baseDiameter:.58,architecture:'leader',forkAngle:64,continuationAngle:1.5,
            mainRatio:.79,lateralRatio:.8,branchStart:.2,branchEnd:.87,trunkClearance:.5,
            lowerLengthScale:1.3,upperLengthScale:.3,upperAngleScale:.38,crownHeight:19,scaffoldBias:.9,
            bend:24,bendBias:.55,bendRecovery:.05,angleVariation:5,lengthVariation:.12,
            lean:0,tilt:1,budSurvival:.95,radiusLoss:.36,leaderLoss:.025,taper:.24,
            rootReach:6,rootDepth:1.2,rootCount:6,rootBaseRatio:.58,rootSinkers:.3}
    }),
    northern_red_oak:record({
        spatialParameters:{baseDiameter:.72,ramificationOutward:.12,primaryApicalScale:.65,trunkBend:22,trunkBendSpread:1,trunkBendRecovery:.55,trunkBendVariation:.25},
        name:'Northern red oak',botanical:'Quercus rubra',habit:'Broad, rounded open-grown crown',
        size:'Typical mature context: 15–23 m tall, potentially similarly wide.',
        structure:'An open-grown crown can be broad with relatively low branches. Alternate nodes; retain a clear hierarchy of stout scaffolds and finer twigs.',
        surface:'Bristle-tipped lobed leaves; older bark develops longitudinal ridges and shallow furrows.',
        mapping:'Stout unequal primary limbs subdivide through six fork tiers with broad divergence and shorter terminal growth.',
        limitation:'Open-grown form is the target, not a universal oak shape. Growth flushes and a mechanical load model remain absent.',
        sources:[nc('quercus-rubra')],
        parameters:{depth:1,ramificationLevels:6,ramificationRatio:.7,ramificationAngle:42,ramificationSideBuds:.45,ramificationOutward:.25,minimumLength:.06,minChildren:4,maxChildren:4,
            trunkLength:4.5,baseDiameter:1,architecture:'mixed',primaryLimbs:7,trunkClearance:.38,forkAngle:72,continuationAngle:7,
            mainRatio:.84,lateralRatio:.88,bend:24,bendBias:.1,scaffoldBias:.1,bendCenter:.58,bendSpread:.25,bendRecovery:.1,
            lowerLengthScale:1.25,upperLengthScale:.8,upperAngleScale:.85,crownHeight:18,forkChance:.5,forkAsymmetry:.3,
            terminalLengthScale:.55,angleVariation:12,lengthVariation:.2,lean:1,tilt:.5,budSurvival:.88,radiusLoss:.25,leaderLoss:.04,taper:.23,
            rootReach:8,rootDepth:1.8,rootCount:6,rootBaseRatio:.65,rootFlare:.9}
    }),
    american_elm:record({
        spatialParameters:{primaryLimbs:5,ramificationOutward:.12,ramificationRatio:.74,baseDiameter:.75,primaryApicalScale:.72,trunkBend:18,trunkBendSpread:1,trunkBendRecovery:.55,trunkBendVariation:.25},
        name:'American elm',botanical:'Ulmus americana',habit:'Upright limbs opening into a wide arch',
        size:'Typical landscape context: 18–24 m tall; 9–18 m wide. Open-grown forks often start at 3–6 m.',
        structure:'Several erect main limbs spread into an arching crown in open sites. Alternate nodes; forest-grown trees can have a much longer clear bole.',
        surface:'Asymmetric, doubly toothed leaves; gray bark with interlacing ridges.',
        mapping:'Ascending unequal main limbs open through broad scaffold arches, with connected secondary growth and short distal shoots.',
        limitation:'Arch profiles describe geometry, not age, wood stiffness or exposure. Planar overlap cannot validate canopy occupancy.',
        sources:[source('US Forest Service','https://research.fs.usda.gov/feis/species-reviews/ulmame'),nc('ulmus-americana')],
        parameters:{depth:2,ramificationLevels:4,ramificationRatio:.7,ramificationAngle:30,ramificationSideBuds:.65,minimumLength:.06,
            trunkLength:4.5,baseDiameter:.88,architecture:'mixed',minChildren:3,maxChildren:4,
            forkAngle:34,mainRatio:.9,lateralRatio:.82,branchStart:.25,branchEnd:.88,bend:36,scaffoldBias:-.9,bendBias:.2,
            bendCenter:.5,bendSpread:.85,bendRecovery:0,lowerLengthScale:1.2,upperLengthScale:.85,upperAngleScale:.8,crownHeight:18,
            forkChance:.18,forkAsymmetry:.28,terminalLengthScale:.58,angleVariation:7,lengthVariation:.14,
            radiusLoss:.28,leaderLoss:.03,taper:.22,rootReach:8,rootDepth:1.2,rootCount:6,rootBaseRatio:.6,rootFlare:.9}
    }),
    arrowwood_viburnum:record({
        name:'Arrowwood viburnum',botanical:'Viburnum dentatum',habit:'Low, upright-to-rounded shrub',
        size:'Typical mature context: about 1.5–3 m tall and 1.8–3 m wide.',
        structure:'Multiple stems and suckers, upright young growth and arching older branches. Opposite leaf nodes.',
        surface:'Toothed oval leaves with prominent veins; older stems develop gray-brown fissured bark.',
        mapping:'Eleven distinct basal canes on a common root crown; upright inner growth, spreading outer canes and paired lateral candidates.',
        limitation:'Cane size variation approximates a static age mixture. Suckering and renewal over time are not simulated; not every opposite bud develops.',
        sources:[nc('viburnum-dentatum'),source('Morton Arboretum','https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/')],
        parameters:{trunkLength:1.35,baseDiameter:.045,basalCount:11,basalSpread:.38,caneLean:28,caneVariation:.4,
            depth:2,ramificationLevels:3,ramificationRatio:.58,ramificationAngle:27,ramificationSideBuds:.3,architecture:'leader',arrangement:'paired',minChildren:3,maxChildren:3,nodeSpacing:.12,
            forkAngle:35,continuationAngle:3,mainRatio:.69,lateralRatio:.57,branchStart:.3,branchEnd:.85,trunkClearance:.38,
            bend:18,scaffoldBias:-.7,bendBias:.4,bendRecovery:.05,angleVariation:9,lengthVariation:.18,lean:0,tilt:1,
            lowerLengthScale:1.15,upperLengthScale:.6,upperAngleScale:.7,crownHeight:3,maximumSlenderness:150,supportedSlenderness:115,
            radiusLoss:.36,leaderLoss:.05,taper:.26,minimumDiameter:1.2,minimumLength:.06,budSurvival:.8,
            rootReach:1.6,rootDepth:.35,rootCount:8,rootLevels:4,rootChildren:3,rootSinkers:.15,rootBaseRatio:.72,rootMinimumDiameter:.5,rootFlare:1.1}
    })
});
