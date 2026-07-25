const db = require('./database');

function parseCommand(message) {
  // Remove extra whitespace and normalize
  const normalized = message.trim().replace(/\s+/g, ' ');
  
  // Match command pattern: /command args
  const commandMatch = normalized.match(/^\/(\w+)\s*(.*)/);
  
  if (!commandMatch) {
    return null;
  }
  
  const command = commandMatch[1].toLowerCase();
  const argsStr = commandMatch[2].trim();
  
  // Parse arguments based on command type
  let args = {};
  
  switch (command) {
    case 'help':
      args = {};
      break;
      
    case 'addkey':
      // /addkey gg-2024-068 "Coyote Willow" 068
      args = parseAddKeyArgs(argsStr);
      break;
      
    case 'addstock':
      // /addstock 100 gg-2024-068
      args = parseQuantityKeyArgs(argsStr);
      break;
      
    case 'drop':
      // /drop 10 068 section 6
      args = parseDropArgs(argsStr);
      break;
      
    case 'setalloc':
      // /setalloc 200 gg-2024-068 section 6
      args = parseSetAllocArgs(argsStr);
      break;
      
    case 'status':
      // /status section 6  OR  /status 068 section 6
      args = parseStatusArgs(argsStr);
      break;
      
    case 'stock':
      // /stock  OR  /stock 068
      args = parseStockArgs(argsStr);
      break;
      
    case 'remaining':
      // /remaining  OR  /remaining section 6
      args = parseRemainingArgs(argsStr);
      break;
      
    case 'undo':
      args = {};
      break;
      
    case 'math':
      // /math 180 .35
      args = parseMathArgs(argsStr);
      break;
      
    case 'keys':
      // /keys  OR  /keys "Coyote Willow"
      args = parseKeysArgs(argsStr);
      break;
      
    case 'logs':
      // /logs  OR  /logs John
      args = { user: argsStr || null };
      break;
      
    case 'addsection':
      // /addsection 6 "North Field Plot 6"
      args = parseAddSectionArgs(argsStr);
      break;
      
    case 'removesection':
      // /removesection 6
      args = { section: argsStr || null };
      break;
      
    case 'listsections':
      args = {};
      break;
      
    case 'editsection':
      // /editsection 6 "New description"
      args = parseEditSectionArgs(argsStr);
      break;
      
    case 'sync':
      // /sync  OR  /sync inventory
      args = { target: argsStr || null };
      break;
      
    case 'species':
      args = {};
      break;
      
    case 'import':
      // /import  OR  /import inventory  OR  /import confirm
      args = { _: argsStr ? argsStr.split(/\s+/) : [] };
      break;
      
    default:
      return null;
  }
  
  return { command, args };
}

function parseAddKeyArgs(argsStr) {
  // /addkey gg-2024-068 "Coyote Willow" 068
  const match = argsStr.match(/^(\S+)\s+"([^"]+)"\s*(\S*)/);
  if (!match) {
    // Try without quotes
    const match2 = argsStr.match(/^(\S+)\s+(\S+)\s*(\S*)/);
    if (match2) {
      return {
        requestKey: match2[1],
        species: match2[2],
        shortKey: match2[3] || null
      };
    }
    return null;
  }
  return {
    requestKey: match[1],
    species: match[2],
    shortKey: match[3] || null
  };
}

function parseQuantityKeyArgs(argsStr) {
  // /addstock 100 gg-2024-068
  const match = argsStr.match(/^(\d+)\s+(\S+)/);
  if (!match) return null;
  return {
    quantity: parseInt(match[1]),
    requestKey: match[2]
  };
}

function parseDropArgs(argsStr) {
  // /drop 10 068 section 6  OR  /drop 10 068 6
  const withSection = argsStr.match(/^(\d+)\s+(\S+)\s+section\s+(\S+)/i);
  if (withSection) {
    return {
      quantity: parseInt(withSection[1]),
      requestKey: withSection[2],
      section: withSection[3]
    };
  }
  // Without "section" keyword: /drop 10 068 6
  const withoutSection = argsStr.match(/^(\d+)\s+(\S+)\s+(\S+)$/);
  if (withoutSection) {
    return {
      quantity: parseInt(withoutSection[1]),
      requestKey: withoutSection[2],
      section: withoutSection[3]
    };
  }
  return null;
}

function parseSetAllocArgs(argsStr) {
  // /setalloc 200 gg-2024-068 section 6  OR  /setalloc 200 gg-2024-068 6
  const withSection = argsStr.match(/^(\d+)\s+(\S+)\s+section\s+(\S+)/i);
  if (withSection) {
    return {
      quantity: parseInt(withSection[1]),
      requestKey: withSection[2],
      section: withSection[3]
    };
  }
  // Without "section" keyword
  const withoutSection = argsStr.match(/^(\d+)\s+(\S+)\s+(\S+)$/);
  if (withoutSection) {
    return {
      quantity: parseInt(withoutSection[1]),
      requestKey: withoutSection[2],
      section: withoutSection[3]
    };
  }
  return null;
}

function parseStatusArgs(argsStr) {
  // /status section 6  OR  /status 068 section 6
  const sectionOnly = argsStr.match(/^section\s+(\S+)/i);
  if (sectionOnly) {
    return { section: sectionOnly[1], requestKey: null };
  }
  
  const keyAndSection = argsStr.match(/^(\S+)\s+section\s+(\S+)/i);
  if (keyAndSection) {
    return { requestKey: keyAndSection[1], section: keyAndSection[2] };
  }
  
  return null;
}

function parseStockArgs(argsStr) {
  // /stock  OR  /stock 068
  return { requestKey: argsStr || null };
}

function parseRemainingArgs(argsStr) {
  // /remaining  OR  /remaining section 6
  const sectionMatch = argsStr.match(/^section\s+(\S+)/i);
  return { section: sectionMatch ? sectionMatch[1] : null };
}

function parseMathArgs(argsStr) {
  // /math 180 .35
  const match = argsStr.match(/^(\d+(?:\.\d+)?)\s+(\d*\.?\d+)/);
  if (!match) return null;
  return {
    boxSize: parseFloat(match[1]),
    decimal: parseFloat(match[2])
  };
}

function parseKeysArgs(argsStr) {
  // /keys  OR  /keys "Coyote Willow"  OR  /keys Coyote
  const quotedMatch = argsStr.match(/^"([^"]+)"/);
  if (quotedMatch) {
    return { species: quotedMatch[1] };
  }
  return { species: argsStr || null };
}

function parseAddSectionArgs(argsStr) {
  // /addsection 6 "North Field Plot 6"  OR  /addsection 6
  const withQuotes = argsStr.match(/^(\S+)\s+"([^"]+)"/);
  if (withQuotes) {
    return { section: withQuotes[1], description: withQuotes[2] };
  }
  const withoutQuotes = argsStr.match(/^(\S+)\s+(.+)/);
  if (withoutQuotes) {
    return { section: withoutQuotes[1], description: withoutQuotes[2] };
  }
  // Just section ID
  return { section: argsStr || null, description: null };
}

function parseEditSectionArgs(argsStr) {
  // /editsection 6 "New description"
  const withQuotes = argsStr.match(/^(\S+)\s+"([^"]+)"/);
  if (withQuotes) {
    return { section: withQuotes[1], description: withQuotes[2] };
  }
  const withoutQuotes = argsStr.match(/^(\S+)\s+(.+)/);
  if (withoutQuotes) {
    return { section: withoutQuotes[1], description: withoutQuotes[2] };
  }
  return null;
}

// Resolve request key (full or short)
function resolveRequestKey(keyInput) {
  // First try exact match (full request key)
  let result = db.getRequestKey(keyInput);
  if (result) {
    return { resolved: true, key: result, ambiguous: false };
  }
  
  // Try short key match
  const shortResults = db.getRequestKeyByShort(keyInput);
  
  if (shortResults.length === 0) {
    return { resolved: false, key: null, ambiguous: false };
  }
  
  if (shortResults.length === 1) {
    return { resolved: true, key: shortResults[0], ambiguous: false };
  }
  
  // Multiple matches - ambiguous
  return { resolved: false, key: null, ambiguous: true, matches: shortResults };
}

module.exports = {
  parseCommand,
  resolveRequestKey
};
