/**
 * Element Tools Integration for Playwright MCP Server
 * Comprehensive integration of all element interaction and selection tools
 */

import { MCPTool } from '../../types.js';
import { PlaywrightService } from '../../services/playwright.js';

// Import all element tool modules
import { createAdvancedLocatorTools } from './locators/locator-strategies.js';
import { createAdvancedClickTools } from './interactions/click-actions.js';
import { createElementStateTools } from './information/element-state.js';
import { createAdvancedInputActionTools } from './interactions/advanced-input-actions.js';
import { createFormManagementTools } from './forms/form-management.js';
import { createElementAnalysisTools } from './analysis/element-extraction.js';
import { createAdvancedInteractionTools } from './interactions/advanced-interactions.js';

/**
 * Create all element interaction and selection tools
 * Total: 50+ comprehensive element tools
 */
export function createComprehensiveElementTools(playwrightService: PlaywrightService): MCPTool[] {
  const allTools: MCPTool[] = [];

  try {
    // Advanced Element Location Tools (12 tools)
    const locatorTools = createAdvancedLocatorTools(playwrightService);
    allTools.push(...locatorTools);

    // Advanced Click Actions (7 tools) 
    const clickTools = createAdvancedClickTools(playwrightService);
    allTools.push(...clickTools);

    // Element State and Information Tools (10 tools)
    const stateTools = createElementStateTools(playwrightService);
    allTools.push(...stateTools);

    // Advanced Input Actions Tools (10 tools)
    const inputTools = createAdvancedInputActionTools(playwrightService);
    allTools.push(...inputTools);

    // Form Management Tools (8 tools)
    const formTools = createFormManagementTools(playwrightService);
    allTools.push(...formTools);

    // Element Analysis and Extraction Tools (5 tools)
    const analysisTools = createElementAnalysisTools(playwrightService);
    allTools.push(...analysisTools);

    // Advanced Interaction Tools (6+ tools from the sample)
    const interactionTools = createAdvancedInteractionTools(playwrightService);
    allTools.push(...interactionTools);

    console.log(`✅ Successfully created ${allTools.length} comprehensive element tools`);
    
  } catch (error) {
    console.error('❌ Error creating element tools:', error);
    throw new Error(`Failed to create element tools: ${error.message}`);
  }

  return allTools;
}

/**
 * Get element tools by category for organized access
 */
export function getElementToolsByCategory(playwrightService: PlaywrightService) {
  return {
    // Core Element Location (12 tools)
    locators: {
      description: 'Advanced element location strategies using ARIA, text, labels, and selectors',
      tools: createAdvancedLocatorTools(playwrightService),
      count: 12
    },

    // Click Operations (7 tools)
    clicking: {
      description: 'Sophisticated click operations with retry logic and intelligent positioning',
      tools: createAdvancedClickTools(playwrightService),
      count: 7
    },

    // Element Information (10 tools)
    information: {
      description: 'Comprehensive element state inspection and property extraction',
      tools: createElementStateTools(playwrightService),
      count: 10
    },

    // Input Actions (10 tools)
    input: {
      description: 'Advanced input operations including file uploads and formatted data entry',
      tools: createAdvancedInputActionTools(playwrightService),
      count: 10
    },

    // Form Management (8 tools)
    forms: {
      description: 'Complete form operations including validation, submission, and data extraction',
      tools: createFormManagementTools(playwrightService),
      count: 8
    },

    // Content Analysis (5 tools)
    analysis: {
      description: 'Content extraction, accessibility analysis, and structural inspection',
      tools: createElementAnalysisTools(playwrightService),
      count: 5
    },

    // Advanced Interactions (6+ tools)
    interactions: {
      description: 'Complex interactions including drag & drop, gestures, and batch operations',
      tools: createAdvancedInteractionTools(playwrightService),
      count: 6
    }
  };
}

/**
 * Tool registry with metadata for documentation and discovery
 */
export const ELEMENT_TOOLS_REGISTRY = {
  // Advanced Element Location Tools
  'locator_get_by_role': {
    category: 'locators',
    description: 'Locate elements by ARIA role with advanced options',
    complexity: 'medium',
    useCase: 'accessibility-focused element location'
  },
  'locator_get_by_text': {
    category: 'locators', 
    description: 'Locate elements by text content with regex support',
    complexity: 'low',
    useCase: 'text-based element finding'
  },
  'locator_get_by_label': {
    category: 'locators',
    description: 'Locate form elements by associated label text',
    complexity: 'low',
    useCase: 'form element location'
  },
  'locator_get_by_placeholder': {
    category: 'locators',
    description: 'Locate input elements by placeholder text',
    complexity: 'low',
    useCase: 'input field identification'
  },
  'locator_get_by_alt_text': {
    category: 'locators',
    description: 'Locate images by alt text attribute',
    complexity: 'low',
    useCase: 'image element location'
  },
  'locator_get_by_title': {
    category: 'locators',
    description: 'Locate elements by title attribute',
    complexity: 'low',
    useCase: 'tooltip-enabled element location'
  },
  'locator_get_by_test_id': {
    category: 'locators',
    description: 'Locate elements by test data attributes',
    complexity: 'low',
    useCase: 'test automation element location'
  },
  'locator_css_selector': {
    category: 'locators',
    description: 'Advanced CSS selector with optimization',
    complexity: 'medium',
    useCase: 'precise element targeting with CSS'
  },
  'locator_xpath': {
    category: 'locators',
    description: 'XPath expressions with validation',
    complexity: 'high',
    useCase: 'complex element location with XPath'
  },
  'locator_nth_match': {
    category: 'locators',
    description: 'Get nth element from locator results',
    complexity: 'low',
    useCase: 'selecting specific instance from multiple matches'
  },
  'locator_first': {
    category: 'locators',
    description: 'Get first element from locator results',
    complexity: 'low',
    useCase: 'selecting first match from multiple results'
  },
  'locator_last': {
    category: 'locators',
    description: 'Get last element from locator results', 
    complexity: 'low',
    useCase: 'selecting last match from multiple results'
  },

  // Element State and Information Tools
  'element_get_attribute': {
    category: 'information',
    description: 'Get element attribute value',
    complexity: 'low',
    useCase: 'attribute value extraction'
  },
  'element_get_property': {
    category: 'information',
    description: 'Get DOM property value',
    complexity: 'low',
    useCase: 'DOM property inspection'
  },
  'element_get_computed_style': {
    category: 'information',
    description: 'Get CSS computed styles',
    complexity: 'medium',
    useCase: 'style inspection and validation'
  },
  'element_get_bounding_box': {
    category: 'information',
    description: 'Get element position and size',
    complexity: 'low',
    useCase: 'element positioning and layout analysis'
  },
  'element_text_content': {
    category: 'information',
    description: 'Get text content including hidden text',
    complexity: 'low',
    useCase: 'text content extraction'
  },
  'element_inner_text': {
    category: 'information',
    description: 'Get visible text content only',
    complexity: 'low',
    useCase: 'visible text extraction'
  },
  'element_inner_html': {
    category: 'information',
    description: 'Get innerHTML content',
    complexity: 'low',
    useCase: 'HTML content inspection'
  },
  'element_outer_html': {
    category: 'information',
    description: 'Get outerHTML content',
    complexity: 'low',
    useCase: 'complete element HTML extraction'
  },
  'element_is_visible': {
    category: 'information',
    description: 'Check element visibility',
    complexity: 'medium',
    useCase: 'visibility state validation'
  },
  'element_is_enabled': {
    category: 'information',
    description: 'Check element enabled state',
    complexity: 'low',
    useCase: 'interaction readiness validation'
  },

  // Advanced Input Actions
  'element_clear': {
    category: 'input',
    description: 'Clear input field content',
    complexity: 'low',
    useCase: 'input field clearing with multiple methods'
  },
  'element_press_key': {
    category: 'input',
    description: 'Press key combinations',
    complexity: 'low',
    useCase: 'keyboard shortcuts and key presses'
  },
  'element_input_files': {
    category: 'input',
    description: 'Upload files to input',
    complexity: 'medium',
    useCase: 'file upload operations'
  },
  'element_focus': {
    category: 'input',
    description: 'Set focus on element',
    complexity: 'low',
    useCase: 'focus management'
  },
  'element_blur': {
    category: 'input',
    description: 'Remove focus from element',
    complexity: 'low',
    useCase: 'focus removal'
  },
  'element_scroll_into_view': {
    category: 'input',
    description: 'Scroll element into viewport',
    complexity: 'low',
    useCase: 'element visibility management'
  },
  'element_select_text': {
    category: 'input',
    description: 'Select text within element',
    complexity: 'medium',
    useCase: 'text selection operations'
  },
  'element_type_realistic': {
    category: 'input',
    description: 'Type with human-like patterns',
    complexity: 'high',
    useCase: 'realistic typing simulation'
  },
  'element_paste': {
    category: 'input',
    description: 'Paste content into element',
    complexity: 'low',
    useCase: 'clipboard content insertion'
  },
  'element_fill_formatted': {
    category: 'input',
    description: 'Fill with formatted data',
    complexity: 'high',
    useCase: 'formatted data entry with validation'
  },

  // Form Management Tools
  'element_select_option': {
    category: 'forms',
    description: 'Select dropdown options',
    complexity: 'medium',
    useCase: 'dropdown and select element interaction'
  },
  'element_check': {
    category: 'forms',
    description: 'Check checkbox or radio',
    complexity: 'low',
    useCase: 'checkbox and radio button selection'
  },
  'element_uncheck': {
    category: 'forms',
    description: 'Uncheck checkbox',
    complexity: 'low',
    useCase: 'checkbox deselection'
  },
  'element_set_checked': {
    category: 'forms',
    description: 'Set checkbox state explicitly',
    complexity: 'low',
    useCase: 'explicit checkbox state management'
  },
  'form_submit': {
    category: 'forms',
    description: 'Submit form with validation',
    complexity: 'high',
    useCase: 'form submission with comprehensive validation'
  },
  'form_reset': {
    category: 'forms',
    description: 'Reset form to initial state',
    complexity: 'medium',
    useCase: 'form state reset'
  },
  'form_get_data': {
    category: 'forms',
    description: 'Extract form field values',
    complexity: 'high',
    useCase: 'form data extraction and analysis'
  },
  'form_fill_data': {
    category: 'forms',
    description: 'Fill entire form from data',
    complexity: 'high',
    useCase: 'bulk form filling from data objects'
  },

  // Element Analysis Tools
  'element_extract_links': {
    category: 'analysis',
    description: 'Extract all links with metadata',
    complexity: 'high',
    useCase: 'link analysis and accessibility checking'
  },
  'element_extract_images': {
    category: 'analysis',
    description: 'Extract images with metadata',
    complexity: 'high',
    useCase: 'image analysis and accessibility validation'
  },
  'element_extract_tables': {
    category: 'analysis',
    description: 'Convert tables to structured data',
    complexity: 'high',
    useCase: 'table data extraction and analysis'
  },
  'element_analyze_accessibility': {
    category: 'analysis',
    description: 'Comprehensive accessibility analysis',
    complexity: 'high',
    useCase: 'accessibility compliance checking'
  },
  'element_get_children': {
    category: 'analysis',
    description: 'Get child element information',
    complexity: 'medium',
    useCase: 'DOM structure analysis'
  },

  // Advanced Interactions
  'element_drag_and_drop': {
    category: 'interactions',
    description: 'Advanced drag and drop operations',
    complexity: 'high',
    useCase: 'drag and drop with multiple methods and validation'
  },
  'elements_batch_operation': {
    category: 'interactions',
    description: 'Batch operations on multiple elements',
    complexity: 'high',
    useCase: 'bulk operations with error handling'
  },
  'element_watch_changes': {
    category: 'interactions',
    description: 'Monitor element for changes',
    complexity: 'high',
    useCase: 'dynamic content monitoring and reaction'
  },
  'element_context_menu': {
    category: 'interactions',
    description: 'Right-click context menu interaction',
    complexity: 'medium',
    useCase: 'context menu operations'
  },
  'element_double_click_advanced': {
    category: 'interactions',
    description: 'Advanced double-click with monitoring',
    complexity: 'medium',
    useCase: 'double-click with event monitoring and validation'
  },
  'element_gesture_operations': {
    category: 'interactions',
    description: 'Complex gesture operations',
    complexity: 'high',
    useCase: 'mobile and touch gesture simulation'
  }
};

/**
 * Get tool documentation and usage examples
 */
export function getElementToolDocumentation(toolName: string) {
  const tool = ELEMENT_TOOLS_REGISTRY[toolName];
  
  if (!tool) {
    return {
      error: `Tool '${toolName}' not found in registry`,
      availableTools: Object.keys(ELEMENT_TOOLS_REGISTRY)
    };
  }

  return {
    name: toolName,
    ...tool,
    examples: getToolExamples(toolName),
    relatedTools: getRelatedTools(toolName, tool.category)
  };
}

function getToolExamples(toolName: string): string[] {
  const examples: Record<string, string[]> = {
    'locator_get_by_role': [
      'Find all buttons: { role: "button" }',
      'Find submit button: { role: "button", name: "Submit" }',
      'Find checked checkbox: { role: "checkbox", checked: true }'
    ],
    'element_fill_formatted': [
      'Format phone: { value: "1234567890", format: "phone" }',
      'Format currency: { value: "123.45", format: "currency" }',
      'Format date: { value: "2024-01-15", format: "date" }'
    ],
    'element_drag_and_drop': [
      'Simple drag: { sourceSelector: ".drag-item", targetSelector: ".drop-zone" }',
      'Manual drag: { method: "manual", steps: 20, delay: 50 }',
      'With data transfer: { method: "dataTransfer", dragData: { text: "Hello" } }'
    ],
    'form_get_data': [
      'Extract all data: { selector: "form", includeMetadata: true }',
      'Validate fields: { validateFields: true, includeHiddenFields: false }',
      'Get structure: { includeMetadata: true, includeHiddenFields: true }'
    ]
  };

  return examples[toolName] || ['No examples available'];
}

function getRelatedTools(toolName: string, category: string): string[] {
  return Object.keys(ELEMENT_TOOLS_REGISTRY)
    .filter(name => name !== toolName && ELEMENT_TOOLS_REGISTRY[name].category === category)
    .slice(0, 5); // Limit to 5 related tools
}

/**
 * Tool statistics and health information
 */
export function getElementToolsStats() {
  const categories = Object.values(ELEMENT_TOOLS_REGISTRY).reduce((acc, tool) => {
    acc[tool.category] = (acc[tool.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const complexity = Object.values(ELEMENT_TOOLS_REGISTRY).reduce((acc, tool) => {
    acc[tool.complexity] = (acc[tool.complexity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalTools: Object.keys(ELEMENT_TOOLS_REGISTRY).length,
    categories,
    complexity,
    version: '1.0.0',
    lastUpdated: new Date().toISOString()
  };
}