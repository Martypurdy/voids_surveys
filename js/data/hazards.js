// Starting points for the RAMS pack: hazards with who they affect and sensible controls, protective equipment,
// permits and the on-the-day "stop and check" questions. All wording is original and is meant to be edited: it is
// a prompt to think about the real job, not a finished assessment. Pure data, no DOM.

/** key, hazard, who might be harmed and how, controls (one per line), core = ticked list in the construction phase plan. */
export const HAZARDS = [
  { key: 'height', core: true, hazard: 'Working at height', who: 'Workers, occupants and anyone below – falls, falling tools or materials',
    controls: 'Choose the right access equipment for the task and check it before every use\nStepladders only for short, light tasks; keep your body inside the stiles\nKeep the area underneath clear or cordoned off\nNo work on ladders or roofs in strong wind or ice' },
  { key: 'dust', core: true, hazard: 'Dust from cutting, sanding or drilling', who: 'Workers and occupants – breathing problems, eye injury',
    controls: 'Use tools with extraction or cut wet where possible\nClean up with a suitable vacuum, not a brush\nWear a correctly fitted dust mask or respirator\nSeal off the work area and ventilate' },
  { key: 'asbestos', core: true, hazard: 'Suspected asbestos materials', who: 'Everyone in the property – long-term lung disease',
    controls: 'Check the asbestos survey or register before starting\nIf unsure, stop work and do not disturb the material\nReport suspected material and keep people out of the area\nOnly start again once it has been checked and cleared' },
  { key: 'electric', core: true, hazard: 'Electricity and hidden cables', who: 'Workers and occupants – shock, burns, fire',
    controls: 'Switch off and prove dead before drilling, cutting or opening up\nUse a cable detector before fixing into walls, floors or ceilings\nUse tools that are tested and in good order\nUse a residual current device (RCD) with portable tools' },
  { key: 'services', core: true, hazard: 'Gas and water services', who: 'Workers and occupants – leaks, flooding, gas release, fire',
    controls: 'Locate and label the isolation points before work starts\nOnly competent, registered people work on gas\nCheck for leaks after any pipework is disturbed\nKeep a plan for what to do if a pipe is damaged' },
  { key: 'manual', hazard: 'Manual handling', who: 'Workers – back and joint injury, dropped loads',
    controls: 'Plan the lift and the route first\nUse trolleys or lifting aids and get help with heavy or awkward items\nBreak loads down; keep items close to the body\nTake breaks during repetitive lifting' },
  { key: 'substances', hazard: 'Paints, adhesives, cleaners and other substances', who: 'Workers and occupants – skin, eye and breathing harm, fire',
    controls: 'Read the label and data sheet before use\nSubstitute with a safer product where possible\nVentilate, and keep lids on when not in use\nStore and dispose of safely; wear the protective equipment listed' },
  { key: 'tools', hazard: 'Hand and power tools', who: 'Workers – cuts, crush injuries, flying debris',
    controls: 'Use the right tool for the job, in good condition, with guards in place\nWear eye protection and gloves suited to the task\nUnplug or remove the battery before changing blades or bits\nKeep leads tidy and out of walkways' },
  { key: 'noise', hazard: 'Noise and vibration', who: 'Workers and occupants – hearing damage, hand-arm vibration',
    controls: 'Choose quieter and low-vibration tools\nLimit the time spent on noisy or vibrating work\nWear hearing protection where it is needed\nAgree noisy work times with the occupant' },
  { key: 'fire', hazard: 'Fire and hot work', who: 'Everyone in the property – burns, smoke, property damage',
    controls: 'Avoid hot work if a cold method will do\nClear combustible materials and keep an extinguisher to hand\nCheck the area again after the work is finished\nKnow the escape route and the fire procedure' },
  { key: 'housekeeping', core: true, hazard: 'Slips, trips and untidy work areas', who: 'Workers, occupants and visitors – falls and bruises',
    controls: 'Keep walkways, stairs and exits clear\nClear waste regularly and do not leave it in escape routes\nCover or mark wet or uneven floors\nKeep leads and hoses off the floor where possible' },
  { key: 'alone', hazard: 'Lone working', who: 'Workers on their own – no help if something goes wrong',
    controls: 'Tell someone where you are, when you started and when you expect to finish\nAgree a check-in time and what happens if you miss it\nKeep a charged phone with you\nDo not take on high-risk tasks alone' },
  { key: 'occupied', core: true, hazard: 'Working in an occupied home', who: 'Tenants, children, pets and vulnerable people – contact with the work, tools or materials',
    controls: 'Agree access, working times and areas with the occupant\nKeep the work area separated and tools and materials locked or out of reach\nTell occupants about any services that will be off\nTreat the home with care; tidy up at the end of each day' },
  { key: 'void', hazard: 'Void property hazards (sharps, pests, mould, waste, damage)', who: 'Workers – cuts, infection, breathing problems, falls through damaged floors',
    controls: 'Walk through first and look before touching\nWear gloves and sturdy boots; use a sharps container\nWear a mask in mouldy or dusty rooms\nReport and avoid unsafe floors, stairs or ceilings' },
  { key: 'fragile', core: true, hazard: 'Fragile or unstable structures and materials', who: 'Workers and others nearby – falls and collapse',
    controls: 'Find out what the structure is made of before loading or opening it up\nSupport work above with props fitted by a competent person\nKeep people out of the area below\nStop and get advice if something looks unsafe' },
  { key: 'public', core: true, hazard: 'Deliveries, waste and the public', who: 'Neighbours, passers-by, children – vehicle and falling-object injuries',
    controls: 'Plan where vehicles stop and where materials and skips go\nUse a banksman or barriers where people could be at risk\nKeep the site secure so people cannot walk in\nCover and clear waste before it blows or spills' },
];

export const CORE_HAZARD_KEYS = HAZARDS.filter((h) => h.core).map((h) => h.key);

export const PPE = ['Hard hat', 'Safety boots', 'High-visibility clothing', 'Gloves', 'Eye protection', 'Ear defenders', 'Dust mask or respirator', 'Knee pads', 'Fall protection', 'Disposable overalls'];

export const PERMITS = ['General permit to work', 'Confined space entry', 'Excavation (digging)', 'Hot work', 'Out-of-hours work', 'Isolation of services'];

export const BRIEFING_KINDS = ['Risk assessment', 'Method statement', 'Toolbox talk', 'Pre-task briefing', 'Permit', 'Other'];

/** On-the-day "stop and check" questions: answer Yes, No or N/A. */
export const DYNAMIC_CHECKS = [
  ['place', 'Am I at the right place, doing the task that was planned?'],
  ['plan', 'Do I have the plan or method statement, and has everyone read it?'],
  ['area', 'Is the work area clear, lit and safe to go into?'],
  ['ppe', 'Is the right protective equipment here and in good condition?'],
  ['equipment', 'Are ladders, steps and tools checked and fit to use?'],
  ['services', 'Have power, gas and water been checked, and isolated if needed?'],
  ['unexpected', 'Is there any sign of asbestos, mould, sharps or damage that changes the plan?'],
  ['people', 'Are tenants, neighbours and other trades kept clear of the work?'],
  ['emergency', 'Do I know the emergency arrangements and where first aid is?'],
  ['changed', 'Has anything changed since the assessment was written?'],
];

export const DYNAMIC_OUTCOMES = [['go', 'Safe to go ahead'], ['adjust', 'Go ahead with changes'], ['stop', 'Stop – not safe']];

export const SAFETY_NOTE = 'A starting point only: check it against the real job and the people doing it. It does not replace your own judgement, training or legal advice.';

/** The hazards in the pick list, by title. */
export const hazardByTitle = (t) => HAZARDS.find((h) => h.hazard === t);
