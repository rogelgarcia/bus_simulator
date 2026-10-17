// Shared parameter contract for the generator and the interactive study.
import {species} from './species.mjs';
const control=(key,label,value,min,max,step,unit,hint='')=>({key,label,value,min,max,step,unit,hint});
export const groups=Object.freeze([
    {title:'Ramification levels',controls:[
        control('primaryApicalScale','Mixed-crown top limb length',1,.4,1,.05,'profile','Length multiplier for the initial mixed-crown fork at the trunk tip. Lower values keep one upright limb from extending far above spreading scaffolds. Other primary limbs retain their own height profiles.'),
        control('leaderLaterals','Laterals per leader axis',0,0,8,1,'count','Independent lateral-node budget for order-zero trunk and leader axes. Zero retains the ordinary child-count settings; the continuing leader uses one additional slot.'),
        control('primaryLimbs','Mixed-crown primary limbs',0,0,8,1,'count','Number of major limbs distributed along the initial trunk in mixed architecture. Zero uses the ordinary child-count settings. Later framework and daughter tiers keep their own counts.'),
        control('ramificationLevels','Daughter-fork levels',0,0,6,1,'count','After the framework levels, subdivide terminal axes through this many true bifurcation tiers. Both daughters can divide again; terminal classification does not stop them. Zero keeps the previous grammar.'),
        control('ramificationSideBuds','Intermediate side forks',0,0,1,.05,'percent','Probability of one smaller side branch between the start and tip bifurcation. It subdivides through the remaining levels and avoids leaving long bare stretches between terminal clusters.'),
        control('ramificationRatio','Daughter length / parent',.58,.35,.8,.01,'percent','Relative length of the larger daughter at each ramification tier. The other daughter is shorter according to Fork inequality.'),
        control('ramificationAngle','Daughter divergence',30,10,60,1,'deg','Nominal daughter departure from the parent tangent. This angle remains meaningful at higher orders instead of collapsing into parallel sprays.'),
        control('ramificationOutward','Outward growth preference',0,0,.8,.05,'percent','Steer daughter growth away from the crown base. This limits repeated turns back through the crown while preserving unequal forks. It is a geometric preference, not a light simulation.')
    ]},
    {title:'Plant base',controls:[
        control('basalCount','Basal stems',1,1,15,1,'count','Separate stems on one shared root crown. One stem uses the ordinary trunk controls.'),
        control('basalSpread','Crown width at grade',.45,.05,1.5,.01,'m','Width occupied by basal origins. Each cane keeps its own ground anchor when the plant leans.'),
        control('caneLean','Outer cane lean',25,0,50,1,'deg','Outer stems spread; inner stems start upright. Seeded variation changes each cane independently.'),
        control('caneVariation','Cane size variation',.25,0,.5,.01,'percent','Variation of initial cane length and thickness. This is a static age mixture, not renewal over time.')
    ]},
    {title:'Context rules',controls:[
        control('contextStrength','Role and position influence',0,0,1,.05,'percent','Blend shared role/order/crown-position rules into numeric settings. Zero retains the accepted v8 uniform grammar; no species scripts are loaded.'),
        control('crownHeight','Crown height guide',18,1,40,.1,'m','Height used to evaluate crown-position profiles. A guide, not a clipping envelope or a measured adult height.'),
        control('lowerLengthScale','Lower lateral length scale',1,.3,1.8,.05,'profile','Multiplier on side-branch length near the crown base.'),
        control('upperLengthScale','Upper lateral length scale',1,.2,1.5,.05,'profile','Multiplier near the crown top, interpolated by actual attachment height.'),
        control('upperAngleScale','Upper insertion angle scale',1,.2,1.2,.01,'profile','Smaller values make upper lateral branches depart more steeply from an upright leader.'),
        control('orderLengthScale','Length scale per lateral order',1,.5,1,.01,'profile','Progressively reduces lateral length with branch order. Continuations retain their order.'),
        control('terminalOrder','Terminal shoot order',3,2,5,1,'count','Laterals at this order and beyond use shorter lengths and restrained curvature.'),
        control('terminalLengthScale','Terminal length scale',.65,.3,1,.01,'profile','Length multiplier for the terminal class, in addition to order and crown-position profiles.'),
        control('leaderBendScale','Leader bend scale',.2,0,1,.01,'profile','Curvature strength of persistent central continuations.'),
        control('scaffoldBendScale','Scaffold bend scale',1,0,1,.05,'profile','Curvature strength of first-order scaffolds and their continuations.'),
        control('scaffoldBias','Scaffold bend preference',-.7,-1,1,.05,'bias','Negative opens an arch outward; positive turns spreading limbs upward. Inner upright axes receive less directional bend.'),
        control('terminalBendScale','Terminal bend scale',.2,0,1,.05,'profile','Keeps terminal shoots restrained while allowing stronger main-limb arches.')
    ]},
    {title:'Branch sites & support',controls:[
        control('nodeSpacing','Minimum node interval',0,0,2,.01,'m','Minimum distance between distinct lateral nodes. Counts become upper budgets; paired buds may share a node. Zero keeps the earlier count-based placement.'),
        control('forkChance','Unequal tip-fork probability',0,0,.8,.01,'percent','A scaffold can divide at its tip while retaining side branches and a dominant continuation. The fork uses one available child slot.'),
        control('forkAsymmetry','Fork inequality',0,0,.7,.01,'percent','Reduces subordinate daughter length and radius relative to the dominant daughter. Fork allocation respects the parent cross-section.'),
        control('maximumSlenderness','Maximum length / base radius',0,0,250,1,'profile','Shorten an axis that would exceed this ratio; ordinary minimum length can then stop it. Zero disables the constraint.'),
        control('supportedSlenderness','Maximum supported reach / radius',0,0,250,1,'profile','Bottom-up sizing inherited from the earlier V2 growth work: wood supports its entire downstream reach. May increase the base diameter; this is artistic allometry, not a mechanical solver. Zero disables it.'),
        control('junctionBlend','Attachment tangent blend',0,0,.3,.01,'percent','Proximal fraction of each child that turns smoothly from its parent tangent into its insertion direction.')
    ]},
    {title:'Root system',controls:[
        control('rootReach','Maximum spread per side',7,.2,20,.1,'m','Horizontal extent from the trunk in this 2D soil section. This bounds the generated roots; actual extent can be smaller. It is independent of crown size.'),
        control('rootDepth','Maximum soil depth',1.8,.1,8,.01,'m','Deepest permitted centerline below ground. Soil conditions strongly affect real rooting depth; this is a geometric boundary, not a soil simulation.'),
        control('rootCount','Main lateral roots',4,2,8,1,'count','Structural roots originating at the trunk base, divided between the two sides of this section. This is not the total root count around a 3D tree.'),
        control('rootSinkers','Sinker probability',.55,0,1,.05,'percent','Chance of a downward root from each main lateral. Sinkers attach partway along a root and remain within the soil depth.'),
        control('rootTaproot','Taproot depth',0,0,1,.05,'percent','Optional central descending root as a fraction of maximum soil depth. Zero omits it. A persistent taproot is not assumed for every mature tree.')
    ]},
    {title:'Root branching',controls:[
        control('rootLevels','Root growth levels',3,1,5,1,'count','Includes the main lateral roots. Each additional level adds shorter, thinner side roots along their parent.'),
        control('rootChildren','Side roots per axis',2,0,3,1,'count','Number of proposed side roots at staggered positions along each root. Size and soil boundaries may stop a candidate.'),
        control('rootLengthRatio','Side length / parent',.48,.2,.7,.01,'percent','Side-root target length relative to its parent. Soil boundaries can shorten it further.'),
        control('rootForkAngle','Root insertion angle',32,10,65,1,'deg','Side roots depart from their parent’s local tangent. Alternating directions and staggered nodes avoid repeated forks at one point.'),
        control('rootRandomness','Root randomness',.25,0,.8,.05,'percent','Seeded variation in root length, insertion angle, spacing and bending. Uses a separate random stream from the canopy.')
    ]},
    {title:'Root shape & taper',controls:[
        control('rootBend','Root bending',22,0,50,1,'deg','Controls a single smooth bow between root nodes. Zero makes each root axis straight. Soil bounds constrain the curve; there is no point-by-point noise.'),
        control('rootBaseRatio','Main thickness / trunk',.48,.15,.8,.01,'percent','Main root diameter relative to trunk diameter at ground level.'),
        control('rootThicknessLoss','Thickness lost at a fork',.48,.2,.8,.01,'percent','Each child begins thinner than the parent at its actual attachment position.'),
        control('rootTaper','Thickness lost along a root',.82,.3,.98,.01,'percent','Base-to-tip taper profile. The last 10% receives additional taper to a fine tip, beyond all side-root attachments.'),
        control('rootMinimumDiameter','Smallest root diameter',2,0,15,.5,'mm','Stops very fine roots. This study draws woody structure, not root hairs or the full absorbing-root network.'),
        control('rootFlare','Base widening',.65,0,1.5,.05,'percent','Additional radius at ground level, blending into the existing trunk. This changes the root collar without bending or moving the canopy.'),
        control('rootFlareHeight','Flare height / diameter',1,.25,2,.05,'profile','Height of the basal transition relative to trunk diameter, capped at 40% of the initial trunk length.')
    ]},
    {title:'Trunk shape',controls:[
        control('trunkBend','Trunk bend',6,-75,75,1,'trunkTurn','Bend the initial trunk from the ground to its first tip junction. Negative bends left, positive bends right. This changes its centerline, independently of branches and whole-tree lean.'),
        control('trunkBendCenter','Bend position',.5,.15,.85,.05,'percent','Position of the curved zone along the trunk: 0% is the ground and 100% is its tip.'),
        control('trunkBendSpread','Length of curved zone',.8,.05,1,.05,'percent','A wide zone bends the trunk gradually; a narrow zone concentrates the bend around the chosen position.'),
        control('trunkBendRecovery','Tip recovery',.15,0,1,.05,'percent','Counteract part of the trunk bend toward its tip. At 100%, the tip returns toward its original heading while the middle remains bowed.'),
        control('trunkBendVariation','Bend randomness',0,0,1,.05,'percent','Zero uses the selected bend exactly. Larger values let the seed reduce its strength, down to zero at 100%; the chosen left/right direction is retained.')
    ]},
    {title:'Branch structure',controls:[
        control('depth','Framework levels',7,1,8,1,'count'),
        control('trunkLength','Trunk length',3.1,.2,6,.01,'m'),
        control('forkAngle','Side branch angle',38,10,80,1,'deg'),
        control('continuationAngle','Leader deflection',5,0,25,.5,'deg'),
        control('mainRatio','Leader length / parent',.82,.4,.96,.01,'percent'),
        control('lateralRatio','Side length / parent',.66,.25,.9,.01,'percent'),
        control('branchStart','First side shoot',.35,.05,.85,.01,'percent'),
        control('branchEnd','Last side shoot',.9,.15,1,.01,'percent'),
        control('trunkClearance','Clear lower trunk',.78,.3,.98,.01,'percent'),
        control('stagger','Spread attachment points',1,0,1,.05,'percent','Zero groups side shoots at the last position; 100% distributes them along the allowed span.'),
        control('nodeJitter','Spacing randomness',.25,0,.8,.05,'percent')
    ]},
    {title:'Branch shape',controls:[
        control('bend','Maximum bend',22,0,90,1,'deg','Maximum heading change within a branch. Zero makes branch segments straight. The initial trunk has its own independent shape controls.'),
        control('bendCenter','Bend position',.5,.15,.85,.01,'percent','Move the curved section from the base toward the tip.'),
        control('bendSpread','Length of curved zone',.8,.05,1,.05,'percent','Broad zones make gradual arches; narrow zones concentrate a change of direction.'),
        control('bendRecovery','Tip recovery',.15,0,1,.05,'percent','Fraction of the turn counteracted farther along the branch. At 100%, the tip returns toward its original direction.'),
        control('bendBias','Bend direction',-.4,-1,1,.05,'bias'),
        control('bendProfile','Gradual-turn profile',1.2,.4,3,.1,'profile','Used by Gradual only: below 1 bends earlier; above 1 bends later.')
    ]},
    {title:'Direction & randomness',controls:[
        control('tilt','Growth tilt',-1,-8,8,.5,'tilt'),
        control('lean','Tree lean',2,-20,20,1,'lean'),
        control('angleVariation','Angle randomness',6,0,20,.5,'deg'),
        control('lengthVariation','Length randomness',.1,0,.3,.01,'percent')
    ]},
    {title:'Thickness & taper',controls:[
        control('baseDiameter','Trunk base diameter',.38,.02,1.2,.005,'m'),
        control('radiusLoss','Thickness lost at a side fork',.38,.05,.75,.01,'percent','Relative to the parent thickness at the attachment, not its base.'),
        control('leaderLoss','Thickness lost at a continuation',.08,0,.4,.005,'percent'),
        control('taper','Thickness lost along a branch',.28,.02,.7,.01,'percent'),
        control('taperProfile','Taper profile',1,.5,3,.1,'profile'),
        control('minimumDiameter','Smallest twig diameter',3,0,15,.1,'mm'),
        control('minimumLength','Shortest branch',.18,.05,.8,.01,'m')
    ]},
    {title:'Bud survival',controls:[
        control('budSurvival','Side buds that develop',.93,.2,1,.01,'percent','A seeded probability, not a simulated light or resource calculation.')
    ]}
]);
export const controls=Object.freeze(groups.flatMap(group=>group.controls));
// Editable modeling starting ranges, not measured species branching statistics.
export const countProfiles=Object.freeze({
    elm:Object.freeze({label:'Moderate branching',min:2,max:3}),
    spreading:Object.freeze({label:'Broad spreading crown',min:2,max:4}),
    leader:Object.freeze({label:'Strong main leader',min:1,max:3}),
    sparse:Object.freeze({label:'Sparse crown',min:1,max:2})
});
export const defaults=Object.freeze({seed:31,species:'american_elm',...Object.fromEntries(controls.map(p=>[p.key,p.value])),
    architecture:'mixed',arrangement:'alternate',bendMode:'localized',countMode:'range',minChildren:2,maxChildren:3,
    branchCounts:Object.freeze([3,3,3,3,2,2,2,2]),competition:false,rootsEnabled:true});
export const presets=Object.freeze({
    ...Object.fromEntries(Object.entries(species).map(([id,p])=>[id,Object.freeze({...defaults,
        rootReach:Number((p.parameters.trunkLength*1.55).toFixed(1)),rootDepth:Math.max(.2,Number((p.parameters.trunkLength*.4).toFixed(1))),...p.parameters,species:id})])),
    organic:defaults,
    forked:Object.freeze({...defaults,species:'generic',architecture:'fork',maxChildren:4,branchCounts:Object.freeze([3,2,3,2,2,2,2,2]),bend:15,bendBias:-.2}),
    straight:Object.freeze({...defaults,species:'generic',countMode:'manual',bend:0,trunkBend:0,angleVariation:0,lengthVariation:0,nodeJitter:0,budSurvival:1,lean:0,tilt:0,rootBend:0,rootRandomness:0})
});
export function settings(options){
    const o={...defaults,...options};
    if(o.species!=='generic'&&!Object.hasOwn(species,o.species))throw Error('Unknown species preset');
    if(!Number.isInteger(o.seed)||o.seed<1||o.seed>999999)throw Error('Invalid branching seed');
    for(const {key,min,max} of controls)if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw Error('Invalid branching setting: '+key);
    if(typeof o.rootsEnabled!=='boolean'||!['rootCount','rootLevels','rootChildren','basalCount','terminalOrder','ramificationLevels','primaryLimbs','leaderLaterals'].every(key=>Number.isInteger(o[key])))throw Error('Invalid root or stem settings');
    if(!Number.isInteger(o.depth)||typeof o.competition!=='boolean'||!['leader','fork','mixed'].includes(o.architecture)||!['alternate','paired'].includes(o.arrangement))throw Error('Invalid branching settings');
    if(o.branchStart>o.branchEnd)throw Error('First side shoot must be before last side shoot');
    if(!['gradual','localized'].includes(o.bendMode))throw Error('Invalid bend mode');
    if(!['range','manual'].includes(o.countMode)||![o.minChildren,o.maxChildren].every(n=>Number.isInteger(n)&&n>=1&&n<=4)||o.minChildren>o.maxChildren)throw Error('Use an ordered child-count range within 1–4');
    if(!Array.isArray(o.branchCounts)||o.branchCounts.length!==8||o.branchCounts.some(n=>!Number.isInteger(n)||n<1||n>4))throw Error('Use 1–4 children for each of eight growth levels');
    return {...o,branchCounts:[...o.branchCounts]};
}
