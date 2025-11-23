const xml2js = require('xml2js');
const fs = require('fs');

// Copy the safeGet function
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
  while (Array.isArray(result) && result.length === 1) {
    result = result[0];
  }
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

// Load and test  
const xmlContent = fs.readFileSync('../MySaveFile.xml', 'utf-8');
const parser = new xml2js.Parser({ explicitArray: true });

parser.parseString(xmlContent, (err, result) => {
  if (err) {
    console.error('Parse error:', err);
    return;
  }
  
  console.log('Testing data extraction...\n');
  
  const characterData = result.root;
  const char = safeGet(characterData, 'character', {});
  
  console.log('char type:', typeof char);
  console.log('char is object:', char && typeof char === 'object');
  console.log('char keys (first 10):', Object.keys(char).slice(0, 10));
  
  const name = safeGet(char, 'name.0');
  console.log('\nname:', name);
  
  const race = safeGet(char, 'race.0');
  console.log('race:', race);
  
  const abilities = safeGet(char, 'abilities.0', {});
  console.log('\nabilities keys:', Object.keys(abilities));
  
  const strength = safeGet(char, 'abilities.0.strength.0');
  console.log('strength object:', strength);
  console.log('strength score:', safeGet(strength, 'score.0'));
});
