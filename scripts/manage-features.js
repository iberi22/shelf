#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const FEATURES_JSON_PATH = path.join(__dirname, '../.gitcore/features.json');

// Helper to load features
function loadFeatures() {
  if (!fs.existsSync(FEATURES_JSON_PATH)) {
    console.error(`Error: features.json not found at ${FEATURES_JSON_PATH}`);
    process.exit(1);
  }
  try {
    const rawData = fs.readFileSync(FEATURES_JSON_PATH, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error('Error parsing features.json:', err.message);
    process.exit(1);
  }
}

// Helper to save features and update metadata
function saveFeatures(data) {
  try {
    // Recalculate metadata stats
    const total = data.features.length;
    const implemented = data.features.filter(
      (f) => f.status === 'implemented' || f.status === 'validated'
    ).length;
    
    data.metadata.total_features = total;
    data.metadata.features_implemented = implemented;
    data.metadata.implementation_percentage = total > 0 ? Math.round((implemented / total) * 100) : 0;
    data.metadata.updated = new Date().toISOString().split('T')[0];

    fs.writeFileSync(FEATURES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('Successfully updated features.json!');
    console.log(`Stats: ${implemented}/${total} features implemented (${data.metadata.implementation_percentage}%).`);
  } catch (err) {
    console.error('Error saving features.json:', err.message);
    process.exit(1);
  }
}

// Command implementations
function listFeatures(categoryFilter) {
  const data = loadFeatures();
  console.log(`\n=== ${data.metadata.project_display} — Feature Registry ===`);
  console.log(`Version: ${data.metadata.version} | Last Updated: ${data.metadata.updated}`);
  console.log(`Overall Progress: ${data.metadata.implementation_percentage}% (${data.metadata.features_implemented}/${data.metadata.total_features})\n`);

  console.log(
    String('ID').padEnd(14) +
    String('Name').padEnd(30) +
    String('Category').padEnd(10) +
    String('Priority').padEnd(10) +
    String('Status')
  );
  console.log('='.repeat(75));

  data.features.forEach((feature) => {
    if (categoryFilter && feature.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return;
    }
    
    let statusSymbol = '🔴';
    if (feature.status === 'implemented') statusSymbol = '🟢';
    if (feature.status === 'validated') statusSymbol = '🔵';
    if (feature.status === 'approved') statusSymbol = '🟡';

    console.log(
      feature.id.padEnd(14) +
      feature.name.substring(0, 28).padEnd(30) +
      feature.category.padEnd(10) +
      feature.priority.padEnd(10) +
      `${statusSymbol} ${feature.status}`
    );
  });
  console.log('');
}

function showFeature(featureId) {
  const data = loadFeatures();
  const feature = data.features.find((f) => f.id.toLowerCase() === featureId.toLowerCase());
  
  if (!feature) {
    console.error(`Error: Feature with ID "${featureId}" not found.`);
    process.exit(1);
  }

  console.log(`\n=== Feature Detail: ${feature.id} ===`);
  console.log(`Name:        ${feature.name}`);
  console.log(`Status:      ${feature.status.toUpperCase()}`);
  console.log(`Category:    ${feature.category}`);
  console.log(`Priority:    ${feature.priority}`);
  console.log(`SDLC Phase:  ${feature.sdlc}`);
  console.log(`Description: ${feature.description}`);
  console.log(`User Story:  "${feature.user_story}"`);
  console.log(`Actor:       ${feature.actor}`);
  console.log(`Technologies: ${feature.technologies.join(', ')}`);
  console.log('\nAcceptance Criteria:');
  feature.acceptance_criteria.forEach((ac, idx) => {
    console.log(`  [ ] ${idx + 1}. ${ac}`);
  });
  console.log('');
}

function toggleFeature(featureId) {
  const data = loadFeatures();
  const feature = data.features.find((f) => f.id.toLowerCase() === featureId.toLowerCase());

  if (!feature) {
    console.error(`Error: Feature with ID "${featureId}" not found.`);
    process.exit(1);
  }

  const oldStatus = feature.status;
  const newStatus = oldStatus === 'implemented' || oldStatus === 'validated' ? 'draft' : 'implemented';
  feature.status = newStatus;

  console.log(`Toggling feature ${feature.id}: ${oldStatus} -> ${newStatus}`);
  saveFeatures(data);
}

function setFeatureStatus(featureId, newStatus) {
  const validStatuses = ['draft', 'approved', 'implemented', 'validated'];
  if (!validStatuses.includes(newStatus.toLowerCase())) {
    console.error(`Error: Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  const data = loadFeatures();
  const feature = data.features.find((f) => f.id.toLowerCase() === featureId.toLowerCase());

  if (!feature) {
    console.error(`Error: Feature with ID "${featureId}" not found.`);
    process.exit(1);
  }

  console.log(`Updating feature ${feature.id} status: ${feature.status} -> ${newStatus.toLowerCase()}`);
  feature.status = newStatus.toLowerCase();
  saveFeatures(data);
}

// CLI Routing
const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : 'help';

switch (command) {
  case 'list':
    listFeatures(args[1]);
    break;
  case 'show':
  case 'status':
    if (!args[1]) {
      console.error('Error: Please specify a feature ID (e.g. node manage-features.js show SRC-FUN-001)');
      process.exit(1);
    }
    showFeature(args[1]);
    break;
  case 'toggle':
    if (!args[1]) {
      console.error('Error: Please specify a feature ID (e.g. node manage-features.js toggle SRC-FUN-001)');
      process.exit(1);
    }
    toggleFeature(args[1]);
    break;
  case 'set':
    if (!args[1] || !args[2]) {
      console.error('Error: Please specify a feature ID and status (e.g. node manage-features.js set SRC-FUN-001 approved)');
      process.exit(1);
    }
    setFeatureStatus(args[1], args[2]);
    break;
  case 'help':
  default:
    console.log(`
GitCore Feature Flag Manager CLI
===============================
Usage:
  node scripts/manage-features.js list [category]
  node scripts/manage-features.js show <feature-id>
  node scripts/manage-features.js toggle <feature-id>
  node scripts/manage-features.js set <feature-id> <status>

Statuses:
  draft | approved | implemented | validated
`);
    break;
}
