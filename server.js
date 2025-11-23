const express = require('express');
const multer = require('multer');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Only XML files are allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Helper functions
function safeGet(obj, path, defaultValue = '') {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }
  // xml2js always returns arrays, so we need to unwrap single elements
  while (Array.isArray(result) && result.length === 1) {
    result = result[0];
  }
  // Handle string values that come wrapped in objects with _ or $t
  if (result && typeof result === 'object') {
    if ('_' in result) {
      return result._;
    }
    if ('$t' in result) {
      return result.$t;
    }
  }
  return result || defaultValue;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatModifier(value) {
  try {
    const val = parseInt(value);
    return val >= 0 ? `+${val}` : String(val);
  } catch {
    return value;
  }
}

function getProficiencyBonus(level) {
  try {
    const lvl = parseInt(level);
    return 2 + Math.floor((lvl - 1) / 4);
  } catch {
    return 2;
  }
}

function generateCharacterHTML(characterData) {
  const char = safeGet(characterData, 'character', {});
  
  // Extract basic info
  const name = safeGet(char, 'name.0');
  const race = safeGet(char, 'race.0');
  const subrace = safeGet(char, 'subrace.0');
  const alignment = safeGet(char, 'alignment.0');
  const background = safeGet(char, 'background.0');
  
  // Calculate total level
  let totalLevel = 0;
  const classesInfo = [];
  const classesData = safeGet(char, 'classes.0', {});
  
  // Classes are stored as id-00001, id-00002, etc.
  Object.keys(classesData).forEach(key => {
    if (key.startsWith('id-')) {
      const cls = classesData[key][0];
      const className = safeGet(cls, 'name.0');
      const classLevel = safeGet(cls, 'level.0');
      const classSpec = safeGet(cls, 'specialization.0');
      const levelNum = parseInt(classLevel) || 0;
      totalLevel += levelNum;
      if (className) {
        classesInfo.push({ name: className, level: classLevel, specialization: classSpec });
      }
    }
  });
  
  const profBonus = getProficiencyBonus(totalLevel);
  
  // Extract abilities
  const abilities = {};
  const abilityNames = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  
  abilityNames.forEach(abilName => {
    const abil = safeGet(char, `abilities.0.${abilName}.0`);
    if (abil) {
      abilities[abilName] = {
        score: safeGet(abil, 'score.0'),
        bonus: safeGet(abil, 'bonus.0'),
        save: safeGet(abil, 'save.0'),
        saveprof: safeGet(abil, 'saveprof.0') === '1'
      };
    }
  });
  
  // Determine spellcasting ability based on class
  let spellcastingAbility = null;
  let spellcastingMod = 0;
  
  classesInfo.forEach(cls => {
    const className = cls.name.toLowerCase();
    if (className.includes('wizard')) {
      spellcastingAbility = 'intelligence';
    } else if (className.includes('druid') || className.includes('cleric') || className.includes('ranger')) {
      spellcastingAbility = 'wisdom';
    } else if (className.includes('paladin') || className.includes('sorcerer') || className.includes('bard') || className.includes('warlock')) {
      spellcastingAbility = 'charisma';
    }
  });
  
  if (spellcastingAbility && abilities[spellcastingAbility]) {
    spellcastingMod = parseInt(abilities[spellcastingAbility].bonus) || 0;
  }
  
  // Calculate spell save DC and spell attack bonus
  const spellSaveDC = 8 + profBonus + spellcastingMod;
  const spellAttackBonus = profBonus + spellcastingMod;
  
  // Calculate melee attack bonus (Strength + Proficiency, unless using finesse)
  const strMod = parseInt(abilities.strength?.bonus || 0);
  const dexMod = parseInt(abilities.dexterity?.bonus || 0);
  const meleeAttackBonus = strMod + profBonus;
  
  // Extract HP
  const hp = safeGet(char, 'hp.0', {});
  const hpTotal = safeGet(hp, 'total.0', '0');
  const hpWounds = safeGet(hp, 'wounds.0', '0');
  const hpTemp = safeGet(hp, 'temporary.0', '0');
  
  // Extract AC
  const ac = safeGet(char, 'defenses.0.ac.0.total.0', '10');
  
  // Extract Speed
  const speed = safeGet(char, 'speed.0.total.0', '30');
  
  // Extract Initiative
  let initiative = safeGet(char, 'initiative.0.total.0');
  if (!initiative && abilities.dexterity) {
    initiative = abilities.dexterity.bonus;
  }
  
  // Extract Skills
  const skills = [];
  const skillListData = safeGet(char, 'skilllist.0', {});
  Object.keys(skillListData).forEach(key => {
    if (key.startsWith('id-')) {
      const skill = skillListData[key][0];
      skills.push({
        name: safeGet(skill, 'name.0'),
        total: safeGet(skill, 'total.0'),
        prof: safeGet(skill, 'prof.0') === '1',
        stat: safeGet(skill, 'stat.0')
      });
    }
  });
  skills.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  
  // Extract Features
  const features = [];
  const featureListData = safeGet(char, 'featurelist.0', {});
  Object.keys(featureListData).forEach(key => {
    if (key.startsWith('id-')) {
      const feature = featureListData[key][0];
      
      // Extract description from formatted text
      let description = '';
      const textObj = feature.text ? feature.text[0] : null;
      if (textObj && textObj.p) {
        description = textObj.p.map(p => {
          if (typeof p === 'string') return p.trim();
          if (p && p._) return p._.trim();
          return '';
        }).filter(Boolean).join('\n\n');
      }
      
      features.push({
        name: safeGet(feature, 'name.0'),
        level: safeGet(feature, 'level.0'),
        description: description
      });
    }
  });
  
  // Extract Feats
  const feats = [];
  const featListData = safeGet(char, 'featlist.0', {});
  Object.keys(featListData).forEach(key => {
    if (key.startsWith('id-')) {
      const feat = featListData[key][0];
      
      // Extract description from formatted text
      let description = '';
      const textObj = feat.text ? feat.text[0] : null;
      if (textObj && textObj.p) {
        description = textObj.p.map(p => {
          if (typeof p === 'string') return p.trim();
          if (p && p._) return p._.trim();
          return '';
        }).filter(Boolean).join('\n\n');
      }
      
      feats.push({
        name: safeGet(feat, 'name.0'),
        category: safeGet(feat, 'category.0'),
        level: safeGet(feat, 'level.0'),
        description: description
      });
    }
  });
  
  // Extract Inventory
  const inventory = [];
  const invListData = safeGet(char, 'inventorylist.0', {});
  Object.keys(invListData).forEach(key => {
    if (key.startsWith('id-')) {
      const item = invListData[key][0];
      
      // Extract description from formatted text
      let description = '';
      const descObj = item.description ? item.description[0] : null;
      if (descObj && descObj.p) {
        description = descObj.p.map(p => {
          if (typeof p === 'string') return p.trim();
          if (p && p._) return p._.trim();
          if (p && p.b && p.b[0]) {
            // Handle bold text like "Splash. " followed by description
            const boldText = p.b[0];
            const restText = p._ ? p._.trim() : '';
            return boldText + restText;
          }
          return '';
        }).filter(Boolean).join('\n\n');
      }
      
      inventory.push({
        name: safeGet(item, 'name.0'),
        count: safeGet(item, 'count.0', '1'),
        cost: safeGet(item, 'cost.0', ''),
        description: description
      });
    }
  });
  
  // Extract Coins
  const coins = {};
  const coinsData = safeGet(char, 'coins.0', {});
  Object.keys(coinsData).forEach(key => {
    if (key.startsWith('id-')) {
      const coin = coinsData[key][0];
      const coinName = safeGet(coin, 'name.0');
      const coinAmount = safeGet(coin, 'amount.0', '0');
      if (coinName) {
        coins[coinName] = coinAmount;
      }
    }
  });
  
  // Extract Spell Slots
  const spellSlots = {};
  const powermeta = safeGet(char, 'powermeta.0', {});
  for (let i = 1; i <= 9; i++) {
    const slotKey = `spellslots${i}`;
    if (powermeta[slotKey] && powermeta[slotKey][0]) {
      const slot = powermeta[slotKey][0];
      const maxSlots = safeGet(slot, 'max.0', '0');
      const usedSlots = safeGet(slot, 'used.0', '0');
      if (maxSlots !== '0') {
        spellSlots[i] = { max: maxSlots, used: usedSlots };
      }
    }
  }
  
  // Extract Sorcery Points
  let sorceryPoints = null;
  const powersData = safeGet(char, 'powers.0', {});
  Object.keys(powersData).forEach(key => {
    if (key.startsWith('id-')) {
      const power = powersData[key][0];
      const powerName = safeGet(power, 'name.0');
      if (powerName === 'Sorcery Points') {
        const max = safeGet(power, 'prepared.0', '0');
        const used = safeGet(power, 'locked.0', '0');
        if (max !== '0') {
          sorceryPoints = { max, used };
        }
      }
    }
  });
  
  // Extract Spells
  const spells = [];
  Object.keys(powersData).forEach(key => {
    if (key.startsWith('id-')) {
      const power = powersData[key][0];
      const group = safeGet(power, 'group.0', '');
      const level = safeGet(power, 'level.0', '');
      const school = safeGet(power, 'school.0', '');
      
      if ((group.includes('Spells') || school) && level) {
        // Extract description from formatted text
        let description = '';
        const descObj = power.description ? power.description[0] : null;
        if (descObj && descObj.p) {
          // Join all paragraphs
          description = descObj.p.map(p => {
            if (typeof p === 'string') return p.trim();
            if (p && p._) return p._.trim();
            return '';
          }).filter(Boolean).join('\n\n');
        }
        
        spells.push({
          name: safeGet(power, 'name.0'),
          level: level,
          prepared: safeGet(power, 'prepared.0', '0'),
          school: school,
          description: description
        });
      }
    }
  });
  spells.sort((a, b) => {
    const aLevel = parseInt(a.level) || 99;
    const bLevel = parseInt(b.level) || 99;
    if (aLevel !== bLevel) return aLevel - bLevel;
    return a.name.localeCompare(b.name);
  });
  
  // Generate HTML (same styling as Python version)
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Character Sheet - ${escapeHtml(name) || 'Unknown'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { font-size: 16px; }
        body {
            font-family: 'Book Antiqua', 'Palatino Linotype', Palatino, serif;
            background: linear-gradient(135deg, #f5f1e8 0%, #e8ddd4 100%);
            padding: 20px;
            color: #2c1810;
            line-height: 1.4;
            min-width: 280px;
            word-wrap: break-word;
            overflow-x: hidden;
        }
        .character-sheet {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border: 3px solid #8b6914;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            padding: 25px;
            box-sizing: border-box;
            width: 100%;
        }
        .header {
            border-bottom: 3px solid #8b6914;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            font-size: 2.5em;
            color: #8b6914;
            text-align: center;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .header-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            font-size: 1.1em;
        }
        .header-info div {
            background: #f5f1e8;
            padding: 8px 12px;
            border-radius: 4px;
            border-left: 4px solid #8b6914;
        }
        .header-info strong { color: #8b6914; margin-right: 5px; }
        .page {
            background: white;
            border: 3px solid #8b6914;
            border-radius: 24px;
            padding: 30px 20px;
            margin: 30px auto;
            max-width: 900px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            box-sizing: border-box;
            width: 100%;
        }
        .page-layout {
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        .sidebar {
            display: flex;
            flex-direction: column;
            gap: 5px;
            width: 100%;
            min-width: 0;
        }
        .stat-box {
            background: #f5f1e8;
            border: 1px solid #8b6914;
            border-radius: 3px;
            padding: 3px;
            text-align: center;
            margin-bottom: 4px;
        }
        .stat-box h3 {
            color: #8b6914;
            font-size: 0.7em;
            margin-bottom: 2px;
            text-transform: uppercase;
        }
        .ability-score {
            font-size: 1.2em;
            font-weight: bold;
            color: #2c1810;
            margin: 2px 0;
        }
        .ability-modifier {
            font-size: 0.95em;
            color: #8b6914;
            font-weight: bold;
            margin: 2px 0;
        }
        .save-box { font-size: 0.85em; margin-top: 5px; }
        .skill-item {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px dotted #ccc;
        }
        .section {
            background: #f5f1e8;
            border: 2px solid #8b6914;
            border-radius: 6px;
            padding: 15px;
        }
        .section h2 {
            color: #8b6914;
            font-size: 1.3em;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #8b6914;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .hp-box {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .hp-box .hp-total {
            font-size: 2em;
            font-weight: bold;
            color: #c12727;
        }
        .hp-box .hp-current {
            font-size: 1.5em;
            color: #2c1810;
        }
        .hp-details {
            display: flex;
            justify-content: space-around;
            margin-top: 10px;
            font-size: 0.9em;
        }
        .features-list, .feats-list, .inventory-list { list-style: none; }
        .features-list li, .feats-list li {
            padding: 6px 0;
            border-bottom: 1px dotted #ccc;
        }
        .inventory-list li {
            padding: 6px 0;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 1px dotted #ccc;
        }
        .spell-slot-level {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
        }
        .spell-slot-level strong {
            min-width: 70px;
            font-size: 0.9em;
            color: #8b6914;
        }
        .spell-slot-bubbles {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .coins {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
            padding: 10px;
        }
        .coin-item {
            text-align: center;
            padding: 8px 15px;
            background: white;
            border-radius: 4px;
            border: 1px solid #8b6914;
        }
        .coin-item input[type="text"] {
            width: 80px;
            padding: 6px;
            border: 1px solid #8b6914;
            border-radius: 3px;
            text-align: center;
            font-size: 1.1em;
            font-weight: bold;
            color: #8b6914;
            margin-top: 8px;
        }
        .spell-level-toggle {
            background: white;
            border: 2px solid #8b6914;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 10px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            transition: background-color 0.2s;
        }
        .spell-level-toggle:hover { background-color: #f5f1e8; }
        .spell-level-toggle h3 {
            color: #8b6914;
            font-size: 1.1em;
            margin: 0;
        }
        .spell-level-content { display: none; }
        .spell-level-content.active { display: block; }
        .spell-description {
            font-size: 0.9em;
            color: #333;
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px dotted #ccc;
        }
        .tooltip-trigger {
            position: relative;
            cursor: help;
            border-bottom: 1px dotted #8b6914;
        }
        .tooltip {
            display: none;
            position: absolute;
            left: 0;
            top: 100%;
            z-index: 1000;
            background: white;
            border: 2px solid #8b6914;
            border-radius: 6px;
            padding: 12px;
            margin-top: 5px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            min-width: 300px;
            font-size: 0.9em;
            line-height: 1.4;
            white-space: normal;
        }
        .tooltip-trigger:hover .tooltip {
            display: block;
        }
        .tooltip-title {
            font-weight: bold;
            color: #8b6914;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid #8b6914;
        }
        .tooltip-content {
            color: #2c1810;
        }
        .tooltip-content p {
            margin: 6px 0;
        }
        @media (max-width: 900px) {
            body { padding: 4px; }
            .character-sheet { padding: 6px; border: 2px solid #8b6914; }
            .header { padding-bottom: 10px; margin-bottom: 12px; }
            .header h1 { font-size: 1.4em; margin-bottom: 6px; }
            .header-info { grid-template-columns: 1fr; gap: 4px; font-size: 0.9em; }
            .page-layout {
                grid-template-columns: 1fr !important;
                gap: 10px !important;
                margin-bottom: 15px !important;
            }
            .sidebar {
                width: 100%;
                flex-direction: row;
                flex-wrap: wrap;
                gap: 8px;
            }
            .stat-box {
                flex: 1;
                min-width: 90px;
                padding: 4px;
                margin-bottom: 0;
            }
            .section { padding: 8px; }
            .section h2 { font-size: 0.95em; margin-bottom: 6px; }
            .page { border: 2px solid #8b6914; padding: 10px; margin: 12px 0; border-radius: 8px; }
        }
        @media (max-width: 600px) {
            html { font-size: 12px; }
            body { padding: 2px; margin: 0; }
            .character-sheet { padding: 4px; border: 1px solid #8b6914; margin: 0; }
            .header { padding-bottom: 8px; margin-bottom: 10px; }
            .header h1 { font-size: 1em; margin: 0; padding-bottom: 6px; }
            .header-info { grid-template-columns: 1fr; gap: 4px; font-size: 0.85em; }
            .page { border: 1px solid #8b6914; padding: 6px; margin: 8px 0; border-radius: 4px; }
            .page-layout {
                grid-template-columns: 1fr !important;
                gap: 8px !important;
                margin-bottom: 10px !important;
            }
            .sidebar { width: 100%; gap: 3px; }
            .stat-box { padding: 2px 3px; margin-bottom: 1px; font-size: 0.8em; }
            .stat-box h3 { font-size: 0.6em; margin-bottom: 1px; }
            .ability-score { font-size: 1em; margin: 1px 0; }
            .section { padding: 4px; }
            .section h2 { font-size: 0.85em; margin-bottom: 6px; padding-bottom: 4px; }
            .spell-level-toggle { flex-direction: column; gap: 6px; padding: 8px; }
            .spell-level-toggle h3 { font-size: 0.85em; }
            button { padding: 3px 6px !important; font-size: 0.7em !important; }
            .coin-item input[type="text"] { width: 60px; padding: 3px; font-size: 0.85em; }
            .hp-details { flex-direction: column; gap: 6px; }
            .skill-item { padding: 2px 0; font-size: 0.8em; }
        }
    </style>
</head>
<body>
    <div class="character-sheet">
        <div class="header">
            <h1>${escapeHtml(name) || 'Character Name'}</h1>
            <div class="header-info">`;
  
  if (race) {
    let raceDisplay = race;
    if (subrace) raceDisplay += ` (${subrace})`;
    html += `                <div><strong>Race:</strong> ${escapeHtml(raceDisplay)}</div>\n`;
  }
  
  if (classesInfo.length > 0) {
    const classesStr = classesInfo.map(c => `${c.name} ${c.level}`).join(', ');
    html += `                <div><strong>Class & Level:</strong> ${escapeHtml(classesStr)}</div>\n`;
  }
  
  if (background) {
    html += `                <div><strong>Background:</strong> ${escapeHtml(background)}</div>\n`;
  }
  
  if (alignment) {
    html += `                <div><strong>Alignment:</strong> ${escapeHtml(alignment)}</div>\n`;
  }
  
  html += `                <div><strong>Proficiency Bonus:</strong> ${formatModifier(profBonus)}</div>
            </div>
        </div>
        
        <div class="page">
            <div class="page-layout">
                <div class="sidebar">`;
  
  // Ability Scores
  abilityNames.forEach(abilName => {
    const abilData = abilities[abilName] || {};
    const abilDisplay = abilName.substring(0, 3).toUpperCase();
    const score = abilData.score || '10';
    const bonus = abilData.bonus || '0';
    const save = abilData.save || '0';
    const isProf = abilData.saveprof || false;
    
    html += `                    <div class="stat-box">
                        <h3>${abilDisplay}</h3>
                        <div class="ability-score">${escapeHtml(score)}</div>
                        <div class="ability-modifier">${formatModifier(bonus)}</div>
                        <div class="save-box">SAVE ${formatModifier(save)} ${isProf ? '✓' : ''}</div>
                    </div>\n`;
  });
  
  // Skills
  html += `                    <div class="stat-box">
                        <h3>Skills</h3>
                        <div style="text-align: left; font-size: 0.85em;">`;
  
  skills.forEach(skill => {
    const profIndicator = skill.prof ? '●' : '○';
    html += `                            <div class="skill-item">
                                <span>${profIndicator} ${escapeHtml(skill.name)}</span>
                                <span>${formatModifier(skill.total)}</span>
                            </div>\n`;
  });
  
  html += `                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="section">
                        <h2>Hit Points</h2>
                        <div class="hp-box">
                            <div class="hp-total">${escapeHtml(hpTotal)}</div>
                            <div class="hp-current">Current HP</div>
                            <div class="hp-details">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span>Wounds:</span>
                                    <input type="text" value="${hpWounds}" style="width: 60px; padding: 4px; border: 1px solid #8b6914; text-align: center;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span>Temp:</span>
                                    <input type="text" value="${hpTemp}" style="width: 60px; padding: 4px; border: 1px solid #8b6914; text-align: center;">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h2>Combat Stats</h2>
                        <div style="text-align: center; padding: 15px;">
                            <div style="margin-bottom: 15px;">
                                <strong>Armor Class:</strong>
                                <div style="font-size: 1.8em; font-weight: bold; color: #8b6914;">${escapeHtml(ac)}</div>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <strong>Initiative:</strong>
                                <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${formatModifier(initiative)}</div>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <strong>Speed:</strong>
                                <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${escapeHtml(speed)} ft</div>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <strong>Proficiency Bonus:</strong>
                                <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${formatModifier(profBonus)}</div>
                            </div>
                            <div>
                                <strong>Melee Attack Bonus:</strong>
                                <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${formatModifier(meleeAttackBonus)}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h2>Features</h2>
                        <ul class="features-list">`;
  
  if (features.length > 0) {
    features.forEach(feature => {
      if (feature.description) {
        // Split description into paragraphs for tooltip
        const paragraphs = feature.description.split('\n\n').filter(Boolean);
        const tooltipContent = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
        
        html += `                            <li>
                                <span class="tooltip-trigger">
                                    <strong>${escapeHtml(feature.name)}</strong> (Lvl ${escapeHtml(feature.level)})
                                    <span class="tooltip">
                                        <div class="tooltip-title">${escapeHtml(feature.name)}</div>
                                        <div class="tooltip-content">${tooltipContent}</div>
                                    </span>
                                </span>
                            </li>\n`;
      } else {
        html += `                            <li><strong>${escapeHtml(feature.name)}</strong> (Lvl ${escapeHtml(feature.level)})</li>\n`;
      }
    });
  } else {
    html += `                            <li><em>No features</em></li>\n`;
  }
  
  html += `                        </ul>
                    </div>
                    
                    <div class="section">
                        <h2>Feats</h2>
                        <ul class="feats-list">`;
  
  if (feats.length > 0) {
    feats.forEach(feat => {
      if (feat.description) {
        // Split description into paragraphs for tooltip
        const paragraphs = feat.description.split('\n\n').filter(Boolean);
        const tooltipContent = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
        
        html += `                            <li>
                                <span class="tooltip-trigger">
                                    <strong>${escapeHtml(feat.name)}</strong>
                                    <span class="tooltip">
                                        <div class="tooltip-title">${escapeHtml(feat.name)}</div>
                                        <div class="tooltip-content">${tooltipContent}</div>
                                    </span>
                                </span>
                            </li>\n`;
      } else {
        html += `                            <li><strong>${escapeHtml(feat.name)}</strong></li>\n`;
      }
    });
  } else {
    html += `                            <li><em>No feats</em></li>\n`;
  }
  
  html += `                        </ul>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="page">
            <div class="section">
                <h2>Equipment</h2>
                <ul class="inventory-list">`;
  
  if (inventory.length > 0) {
    inventory.forEach(item => {
      const countText = item.count !== '1' ? ` x${item.count}` : '';
      
      if (item.description) {
        // Split description into paragraphs for tooltip
        const paragraphs = item.description.split('\n\n').filter(Boolean);
        const tooltipContent = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
        
        html += `                    <li>
                        <span class="tooltip-trigger">
                            <span>${escapeHtml(item.name)}${escapeHtml(countText)}</span>
                            <span class="tooltip">
                                <div class="tooltip-title">${escapeHtml(item.name)}</div>
                                <div class="tooltip-content">${tooltipContent}</div>
                            </span>
                        </span>
                    </li>\n`;
      } else {
        html += `                    <li><span>${escapeHtml(item.name)}${escapeHtml(countText)}</span></li>\n`;
      }
    });
  } else {
    html += `                    <li><em>No equipment</em></li>\n`;
  }
  
  html += `                </ul>
            </div>
            
            <div class="section">
                <h2>Wealth</h2>
                <div class="coins">`;
  
  const coinOrder = ['PP', 'GP', 'EP', 'SP', 'CP'];
  coinOrder.forEach(coinType => {
    const coinValue = coins[coinType] || '0';
    html += `                    <div class="coin-item">
                        <strong>${coinType}</strong>
                        <input type="text" value="${escapeHtml(coinValue)}" />
                    </div>\n`;
  });
  
  html += `                </div>
            </div>
        </div>
        
        <div class="page">`;
  
  // Spell Slots
  if (Object.keys(spellSlots).length > 0) {
    html += `            <div class="section">
                <h2>Spell Slots</h2>`;
    
    Object.keys(spellSlots).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
      const slot = spellSlots[level];
      const maxSlots = parseInt(slot.max);
      const usedSlots = parseInt(slot.used || '0');
      
      html += `                <div class="spell-slot-level">
                    <strong>Level ${level}:</strong>
                    <div class="spell-slot-bubbles">`;
      
      for (let i = 0; i < maxSlots; i++) {
        const checked = i < usedSlots ? 'checked' : '';
        html += `                        <input type="checkbox" ${checked}>\n`;
      }
      
      html += `                    </div>
                </div>\n`;
    });
    
    html += `            </div>\n`;
  }
  
  // Sorcery Points
  if (sorceryPoints) {
    const maxPoints = parseInt(sorceryPoints.max);
    const usedPoints = parseInt(sorceryPoints.used);
    
    html += `            <div class="section">
                <h2>Sorcery Points</h2>
                <div class="spell-slot-bubbles" style="padding: 10px;">`;
    
    for (let i = 0; i < maxPoints; i++) {
      const checked = i < usedPoints ? 'checked' : '';
      html += `                    <input type="checkbox" ${checked}>\n`;
    }
    
    html += `                </div>
            </div>\n`;
  }
  
  // Spells
  if (spells.length > 0) {
    html += `            <div class="section" style="margin-bottom: 15px;">
                <h2>Spellcasting</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: center; padding: 10px;">
                    <div>
                        <strong>Spell Save DC:</strong>
                        <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${escapeHtml(spellSaveDC.toString())}</div>
                    </div>
                    <div>
                        <strong>Spell Attack Bonus:</strong>
                        <div style="font-size: 1.5em; font-weight: bold; color: #8b6914;">${formatModifier(spellAttackBonus)}</div>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0;">Spells</h2>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="expandAllSpells()" style="background: #8b6914; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 0.85em;">Expand All</button>
                        <button onclick="collapseAllSpells()" style="background: #8b6914; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 0.85em;">Collapse All</button>
                    </div>
                </div>`;
    
    const spellsByLevel = {};
    spells.forEach(spell => {
      const level = spell.level && spell.level !== '0' ? spell.level : 'Cantrip';
      if (!spellsByLevel[level]) spellsByLevel[level] = [];
      spellsByLevel[level].push(spell);
    });
    
    const levelOrder = Object.keys(spellsByLevel).sort((a, b) => {
      if (a === 'Cantrip') return -1;
      if (b === 'Cantrip') return 1;
      return parseInt(a) - parseInt(b);
    });
    
    levelOrder.forEach(level => {
      const levelSpells = spellsByLevel[level];
      html += `                <div class="spell-level-toggle" onclick="toggleSpell(this)">
                    <h3>Level ${escapeHtml(level)} (${levelSpells.length} spells)</h3>
                    <span>▼</span>
                </div>
                <div class="spell-level-content">`;
      
      levelSpells.forEach(spell => {
        const preparedMark = spell.prepared && spell.prepared !== '0' ? '●' : '○';
        html += `                    <div style="background: #f5f1e8; padding: 8px; border-radius: 3px; border-left: 3px solid #8b6914; margin-bottom: 8px;">
                        <div><strong>${preparedMark} ${escapeHtml(spell.name)}</strong></div>`;
        
        if (spell.school) {
          html += `                        <div style="font-size: 0.85em;"><strong>School:</strong> ${escapeHtml(spell.school)}</div>\n`;
        }
        
        if (spell.description) {
          // Split description into paragraphs and escape each
          const paragraphs = spell.description.split('\n\n').filter(Boolean);
          html += `                        <div class="spell-description" style="margin-top: 5px; font-size: 0.9em; white-space: pre-wrap;">`;
          paragraphs.forEach(para => {
            html += `<p style="margin: 5px 0;">${escapeHtml(para)}</p>`;
          });
          html += `</div>\n`;
        }
        
        html += `                    </div>\n`;
      });
      
      html += `                </div>\n`;
    });
    
    html += `            </div>\n`;
  }
  
  html += `        </div>
    </div>
    
    <script>
        function toggleSpell(element) {
            const content = element.nextElementSibling;
            content.classList.toggle('active');
        }
        
        function expandAllSpells() {
            document.querySelectorAll('.spell-level-content').forEach(el => {
                el.classList.add('active');
            });
        }
        
        function collapseAllSpells() {
            document.querySelectorAll('.spell-level-content').forEach(el => {
                el.classList.remove('active');
            });
        }
    </script>
</body>
</html>`;
  
  return html;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/preview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'preview.html'));
});

app.post('/generate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const xmlContent = req.file.buffer.toString('utf-8');
    
    // Parse XML
    const parser = new xml2js.Parser({ explicitArray: true });
    const result = await parser.parseStringPromise(xmlContent);
    
    // Extract character name for filename
    let filename = 'character_sheet.html';
    let charName = '';
    try {
      charName = safeGet(result, 'root.character.0.name.0') || '';
      if (charName) {
        const cleanName = String(charName).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
        if (cleanName) {
          filename = `${cleanName}.html`;
        }
      }
    } catch (err) {
      // Use default filename
    }
    
    // Generate HTML
    let html;
    try {
      html = generateCharacterHTML(result.root || result);
      console.log('HTML generated, length:', html.length);
    } catch (htmlError) {
      console.error('Error generating HTML:', htmlError);
      throw new Error('Failed to generate HTML: ' + htmlError.message);
    }
    
    // Return HTML directly
    res.json({
      success: true,
      html: html,
      filename: filename,
      name: charName || 'Character Sheet'
    });
    
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: error.message || 'Error processing file' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
