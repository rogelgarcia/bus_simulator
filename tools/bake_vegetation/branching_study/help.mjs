// Attaches study explanations to titles without adding inline help to the workspace.
import {createHelpPopup} from './help-popup.mjs';
const controlHelp=Object.freeze({
    rootView:'Soil section shows the complete underground graph. Surface exposure masks buried wood in elevation; it is not the perspective view shown in the references. The graph is identical in both views.',
    exposureDepth:'View-only erosion depth as a fraction of basal stem diameter. It changes visibility, never root topology, rooting depth or ownership.',
    seed:'Reusing a seed and the same settings reproduces the same tree. Try another seed to vary it.',
    architecture:'Choose a continuing axis with side shoots, endpoint forks, or a primary fork followed by side shoots.',
    arrangement:'Alternate candidate shoots between sides or place them in opposite pairs at a node. Not every candidate develops.',
    countMode:'Automatic mode samples the inclusive child-count range per parent. Manual mode uses the count at each growth level. Counts include a continuing tip where applicable; survival and size limits can reduce the result.',
    countProfile:'Load an editable child-count range. These are modeling estimates, not measured species statistics.',
    minChildren:'Smallest proposed child count per parent, including the continuing tip in side-shoot modes.',
    maxChildren:'Largest proposed child count per parent. A separate random stream chooses each parent’s count.',
    bendMode:'Curved zone controls where a branch bends and how much it recovers near the tip. Continuous turn uses a gradual profile. The drawing shows maximum strength; actual branches use seeded strength and direction. This is geometry, not a physics solver.',
    depth:'Framework generation levels. Daughter-fork levels add separate finer bifurcations after this framework. Replay reveals both phases; this is topology, not biological age.',
    trunkLength:'Length of the starting trunk axis, in metres. Children derive their lengths from their parent.',
    forkAngle:'Insertion angle of a side shoot relative to the parent’s local direction. Tip forks spread around that direction.',
    continuationAngle:'Deflection of the continuing leader from the parent’s direction at its tip.',
    mainRatio:'Continuation length as a fraction of the parent length, before length variation.',
    lateralRatio:'Side-shoot length as a fraction of the parent length, before length variation.',
    branchStart:'Earliest allowed side-shoot attachment along the parent, measured as a fraction of its length.',
    branchEnd:'Latest allowed side-shoot attachment along the parent, measured as a fraction of its length.',
    trunkClearance:'Clear lower portion of the trunk. Context-enabled mixed architecture distributes primary limbs above this point; endpoint-fork architecture keeps them at the tip.',
    nodeJitter:'Seeded variation in side-shoot attachment positions. Attachments remain on the parent’s actual curve.',
    bendBias:'Preference for upward or downward bending in the upright tree frame. Zero mixes both directions; this is not simulated gravity.',
    tilt:'Adds a directional growth preference at each generation. This differs from rotating the entire tree.',
    lean:'Rotates each above-ground stem family around its actual basal origin. Roots remain in the soil frame; a multistem plant keeps every ground anchor fixed.',
    angleVariation:'Seeded variation around nominal child insertion angles. It does not add noise along the branch.',
    lengthVariation:'Seeded variation around the nominal child length. Children remain shorter than their parent.',
    baseDiameter:'Initial stem diameter at ground level. Optional downstream support sizing can increase resolved wood radii; branch inspection and JSON export show the actual dimensions.',
    leaderLoss:'Thickness reduction for a continuing axis, relative to the parent’s thickness at the attachment.',
    taper:'Thickness reduction from the base to the tip along each branch. Unbranched ends receive a fine terminal taper.',
    taperProfile:'Controls where thickness is lost along the branch. Larger values concentrate the decrease nearer the base.',
    minimumDiameter:'Stop growing candidates whose base diameter is below this size, in millimetres.',
    minimumLength:'Stop growing candidates shorter than this length, in metres.',
    competition:'Reject candidates that cross existing planar centerlines. Disabled by default. A 2D crossing is not proof of a 3D collision.',
    forks:'Show the real parent-child attachment nodes in the drawing.',
    colors:'Color by branch order. A lateral increases the order; a continuation retains it.',
    rootsEnabled:'Generate the root graph and flared collar. Turning this off does not change the canopy or its random streams.',
    showRoots:'Show the root system below a ground line in the full-tree drawing. This display option does not change the generated graph or JSON export. The separate root close-up remains available.',
    stage:'Reveal the graph through this growth level. Replay uses the same graph and does not regenerate it.'
});
const groupHelp=Object.freeze({
    'Ramification levels':'Build the primary framework first, then add explicit unequal daughter forks. Each tier subdivides both daughters again, with shorter lengths and useful angular separation. This changes branch topology rather than drawing decorative twigs.',
    'Plant base':'One bole or multiple independent canes on a common root crown. Every stem retains its own basal origin, dimensions and root ownership.',
    'Context rules':'Shared numeric profiles vary dimensions and curvature by branch role, order, attachment height and position. Zero influence retains uniform rules. These are geometric estimates, not a physiological growth solver.',
    'Branch sites & support':'Minimum node spacing limits proposed counts by usable axis length. Unequal forks can coexist with continuations and side branches. Length/radius limits stop threadlike growth; attachment blending preserves the parent tangent.',
    'Root system':'A schematic 2D soil section: spreading lateral roots, optional descending sinkers and a taproot. Main roots connect to the trunk at ground level. Their real arrangement is radial in 3D. Dimensions are editable estimates, not a prediction of soil or species behavior.',
    'Root branching':'Place progressively shorter and thinner children at staggered positions along the actual parent curve. Root levels and child counts are independent of the canopy. Fine roots stop at the diameter limit; root hairs are not modeled.',
    'Root shape & taper':'Smooth root curves, local-parent thickness and taper. A separate basal collar blends the trunk into the main roots. Curves remain inside the configured soil bounds; this is not an obstacle or resource solver.',
    'Trunk shape':'Shape the initial trunk independently from the branches: left/right bend, curved-zone position and length, tip recovery, and optional seeded variation. The preview shows its actual centerline, including whole-tree lean. Branch attachments follow the curved trunk and its local direction.',
    'Branching pattern':controlHelp.countMode,
    'Branch structure':'Set the number of levels, relative lengths, insertion angles and attachment positions. Children inherit their parent’s local tangent.',
    'Branch shape':controlHelp.bendMode,
    'Direction & randomness':'Control whole-tree lean, growth tilt and seeded angle/length variation independently.',
    'Thickness & taper':'Set base diameter, taper and separate thickness losses for lateral forks and continuing axes. Thickness comes from the local attachment, not the parent’s base.',
    'Bud survival':'A seeded probability determines which side buds develop. This does not yet simulate light, resources or seasons.',
    'Display & competition':controlHelp.competition
});
export function installStudyHelp({controls,species}){
    const $=id=>document.getElementById(id),popup=createHelpPopup(),bind=popup.bind;
    const html=selector=>Array.from(document.querySelectorAll(selector),e=>e.outerHTML).join('');
    for(const label of document.querySelectorAll('label')){
        const input=label.querySelector('input,select'),text=Array.from(label.childNodes).find(n=>n.nodeType===3&&n.textContent.trim());
        if(!input||!text)continue;
        const title=document.createElement('span');title.textContent=text.textContent.trim();text.replaceWith(title);
        const hint=controls.find(p=>p.key===input.id)?.hint||controlHelp[input.id];
        bind(title,input.id==='preset'?()=>$('presetStatus').innerHTML:hint||'Proposed children at this growth level. Counts include the continuing tip; size limits and bud survival may reduce them.');
    }
    for(const summary of document.querySelectorAll('aside summary'))bind(summary,groupHelp[summary.textContent]);
    bind(document.querySelector('h1'),html('header .intro'));
    bind(document.querySelector('aside h2'),'Choose a species starting point, adjust numeric controls, and export the resulting configuration and graph.');
    bind(document.querySelector('.drawing h2'),'Click a branch to inspect its connected descendants below. Replay reveals the growth levels of the current graph.');
    bind($('referenceTitle'),()=>$('speciesFacts').innerHTML+$('referenceCaption').outerHTML);
    bind(document.querySelector('#species h2'),html('#species > .control-note'));
    for(const [id,p] of Object.entries(species)){
        const row=Array.from($('speciesRows').rows).find(r=>r.cells[0].textContent.startsWith(p.name));
        bind(document.querySelector(`[data-preset="${id}"] strong`),`<p><i>${p.botanical}</i></p><p>${p.habit}</p><p>${row.cells[1].innerHTML}</p><p>${row.cells[2].innerHTML}</p>`);
    }
    bind(document.querySelector('.detail-row h2'),'Click a branch or root in the full drawing, or a root in the root close-up, to inspect its connected descendants here.');
    bind($('rootsTitle'),`<p>Roots connect at the trunk base; lateral children and sinkers connect at points on the actual root curves. The ground line stays horizontal when the trunk leans. This section shows woody structure, not every fine absorbing root.</p><p>American elm rooting depth depends on soil texture and moisture; widespread shallow roots are common in wet soils. <a href="https://research.fs.usda.gov/silvics/american-elm" target="_blank">US Forest Service · American elm</a>.</p><p>SpeedTree separates root generation near the base from basal flare shaping. <a href="https://docs9.speedtree.com/modeler/doku.php?id=kcmodelingapproach" target="_blank">Generation placement</a> · <a href="https://docs8.speedtree.com/modeler/doku.php?id=branch_generator" target="_blank">Branch generator and flares</a>.</p><p>All five presets use shared root rules with separate editable reach, depth, branching and collar estimates. Multiple canes belong to one root crown. These values are not measured species root dimensions. The 2D cutaway omits radial spread, soil mechanics, water seeking, obstacles and seasonal growth.</p>`);
    const exportTitle=document.querySelector('.notes h2');exportTitle.textContent='Export & checks';
    bind(exportTitle,html('.notes ol, .notes .control-note'));
    for(const heading of document.querySelectorAll('.research h2')){
        const content=[];let node=heading.nextElementSibling;
        while(node&&node.tagName!=='H2'){content.push(node.outerHTML);node=node.nextElementSibling;}
        bind(heading,content.join(''));
    }
    return popup;
}
