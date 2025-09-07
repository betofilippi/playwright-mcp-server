import { MCPServerError, MCP_ERROR_CODES } from '../../../types.js';
import { SecureHTTPClient, HTTPRequest, HTTPResponse } from '../requests/http-client.js';
import { SessionManager } from '../../../services/session.js';
import { logError, logWarning, logInfo } from '../../../utils/errors.js';

/**
 * API Testing Framework with Assertion Capabilities
 * Provides comprehensive API testing with various assertion types
 */

export type AssertionOperator = 'equals' | 'contains' | 'matches' | 'lessThan' | 'greaterThan' | 'exists' | 'notExists';
export type AssertionType = 'status' | 'header' | 'body' | 'responseTime' | 'jsonPath' | 'regex' | 'size';

export interface APIAssertion {
  type: AssertionType;
  target?: string; // Header name, JSON path, etc.
  operator: AssertionOperator;
  value: any;
  message?: string;
}

export interface APITestCase {
  name: string;
  request: HTTPRequest;
  assertions: APIAssertion[];
  retries?: number;
  retryDelay?: number;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface APITestSuite {
  name: string;
  tests: APITestCase[];
  parallel?: boolean;
  stopOnFailure?: boolean;
  timeout?: number;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface APITestResult {
  testName: string;
  passed: boolean;
  duration: number;
  request: {
    url: string;
    method: string;
    timestamp: Date;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    bodySize: number;
    timing: number;
  };
  assertions: AssertionResult[];
  error?: string;
  retryCount: number;
}

export interface AssertionResult {
  type: AssertionType;
  target?: string;
  operator: AssertionOperator;
  expected: any;
  actual: any;
  passed: boolean;
  message: string;
}

export interface APITestSuiteResult {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  testResults: APITestResult[];
  summary: {
    successRate: number;
    averageResponseTime: number;
    totalRequests: number;
    failedAssertions: number;
  };
}

export class APITestFramework {
  private httpClient: SecureHTTPClient;
  private sessionManager: SessionManager;

  constructor(httpClient: SecureHTTPClient, sessionManager: SessionManager) {
    this.httpClient = httpClient;
    this.sessionManager = sessionManager;
  }

  /**
   * Execute a single API test case
   */
  async executeTest(pageId: string, testCase: APITestCase): Promise<APITestResult> {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = testCase.retries || 0;

    logInfo(`API Test: Starting test "${testCase.name}"`);

    // Execute setup if provided
    if (testCase.setup) {
      try {
        await testCase.setup();
      } catch (error) {
        logError(error, `API Test: Setup failed for "${testCase.name}"`);
        return this.createFailedResult(testCase, 0, `Setup failed: ${error.message}`);
      }
    }

    let lastError: Error | null = null;
    let response: HTTPResponse | null = null;

    // Retry loop
    while (retryCount <= maxRetries) {
      try {
        const requestStartTime = Date.now();
        
        // Execute the HTTP request
        response = await this.httpClient.executeRequest(pageId, testCase.request);
        
        const requestDuration = Date.now() - requestStartTime;

        // Execute assertions
        const assertionResults = await this.executeAssertions(
          testCase.assertions,
          response,
          requestDuration
        );

        const duration = Date.now() - startTime;
        const allPassed = assertionResults.every(a => a.passed);

        // Execute teardown if provided
        if (testCase.teardown) {
          try {
            await testCase.teardown();
          } catch (error) {
            logWarning(`API Test: Teardown failed for "${testCase.name}": ${error.message}`);
          }
        }

        const result: APITestResult = {
          testName: testCase.name,
          passed: allPassed,
          duration,
          request: {
            url: testCase.request.url,
            method: testCase.request.method,
            timestamp: new Date(startTime),
          },
          response: {
            status: response.status,
            headers: response.headers,
            bodySize: response.size.body,
            timing: requestDuration,
          },
          assertions: assertionResults,
          retryCount,
        };

        if (allPassed) {
          logInfo(`API Test: Test "${testCase.name}" passed`);
          return result;
        } else if (retryCount < maxRetries) {
          const failedAssertions = assertionResults.filter(a => !a.passed).length;
          logWarning(`API Test: Test "${testCase.name}" failed ${failedAssertions} assertions, retrying (${retryCount + 1}/${maxRetries})`);
          
          if (testCase.retryDelay) {
            await this.delay(testCase.retryDelay);
          }
          retryCount++;
          continue;
        } else {
          logError(null, `API Test: Test "${testCase.name}" failed after ${maxRetries} retries`);
          return result;
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (retryCount < maxRetries) {
          logWarning(`API Test: Request failed for "${testCase.name}", retrying: ${lastError.message}`);
          if (testCase.retryDelay) {
            await this.delay(testCase.retryDelay);
          }
          retryCount++;
          continue;
        }
        break;
      }
    }

    // All retries exhausted or error occurred
    const duration = Date.now() - startTime;
    
    // Execute teardown even if test failed
    if (testCase.teardown) {
      try {
        await testCase.teardown();
      } catch (error) {
        logWarning(`API Test: Teardown failed for "${testCase.name}": ${error.message}`);
      }
    }

    return this.createFailedResult(
      testCase, 
      duration, 
      lastError?.message || 'Unknown error', 
      retryCount,
      response
    );
  }

  /**
   * Execute a complete API test suite
   */
  async executeTestSuite(pageId: string, testSuite: APITestSuite): Promise<APITestSuiteResult> {
    const suiteStartTime = Date.now();
    logInfo(`API Test Suite: Starting suite "${testSuite.name}" with ${testSuite.tests.length} tests`);

    // Execute suite setup if provided
    if (testSuite.setup) {
      try {
        await testSuite.setup();
        logInfo(`API Test Suite: Setup completed for "${testSuite.name}"`);
      } catch (error) {
        logError(error, `API Test Suite: Setup failed for "${testSuite.name}"`);
        throw new MCPServerError(
          MCP_ERROR_CODES.INTERNAL_ERROR,
          `Test suite setup failed: ${error.message}`
        );
      }
    }

    let testResults: APITestResult[] = [];
    let shouldStop = false;

    try {
      if (testSuite.parallel) {
        // Execute tests in parallel
        const testPromises = testSuite.tests.map(test => 
          this.executeTest(pageId, test)
        );
        
        if (testSuite.timeout) {
          const timeoutPromise = this.createTimeoutPromise(testSuite.timeout);
          const results = await Promise.race([
            Promise.all(testPromises),
            timeoutPromise
          ]);
          testResults = results as APITestResult[];
        } else {
          testResults = await Promise.all(testPromises);
        }

      } else {
        // Execute tests sequentially
        for (const test of testSuite.tests) {
          if (shouldStop) break;

          const result = await this.executeTest(pageId, test);
          testResults.push(result);

          // Check if we should stop on failure
          if (!result.passed && testSuite.stopOnFailure) {
            logWarning(`API Test Suite: Stopping suite "${testSuite.name}" due to test failure`);
            shouldStop = true;
          }
        }
      }

    } finally {
      // Execute suite teardown if provided
      if (testSuite.teardown) {
        try {
          await testSuite.teardown();
          logInfo(`API Test Suite: Teardown completed for "${testSuite.name}"`);
        } catch (error) {
          logWarning(`API Test Suite: Teardown failed for "${testSuite.name}": ${error.message}`);
        }
      }
    }

    const suiteDuration = Date.now() - suiteStartTime;
    const result = this.compileSuiteResult(testSuite.name, testResults, suiteDuration);
    
    logInfo(`API Test Suite: Completed "${testSuite.name}" - ${result.passedTests}/${result.totalTests} passed in ${suiteDuration}ms`);
    
    return result;
  }

  /**
   * Execute assertions against response
   */
  private async executeAssertions(
    assertions: APIAssertion[],
    response: HTTPResponse,
    responseTime: number
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await this.executeAssertion(assertion, response, responseTime);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single assertion
   */
  private async executeAssertion(
    assertion: APIAssertion,
    response: HTTPResponse,
    responseTime: number
  ): Promise<AssertionResult> {
    let actualValue: any;
    let passed = false;

    try {
      // Get actual value based on assertion type
      switch (assertion.type) {
        case 'status':
          actualValue = response.status;
          break;

        case 'header':
          if (!assertion.target) {
            throw new Error('Header name (target) is required for header assertions');
          }
          actualValue = response.headers[assertion.target.toLowerCase()];
          break;

        case 'body':
          actualValue = response.body;
          break;

        case 'responseTime':
          actualValue = responseTime;
          break;

        case 'jsonPath':
          if (!assertion.target) {
            throw new Error('JSON path (target) is required for jsonPath assertions');
          }
          actualValue = this.extractJsonPath(response.body, assertion.target);
          break;

        case 'regex':
          actualValue = response.body?.toString() || '';
          break;

        case 'size':
          actualValue = response.size.body;
          break;

        default:
          throw new Error(`Unknown assertion type: ${assertion.type}`);
      }

      // Evaluate assertion based on operator
      passed = this.evaluateAssertion(actualValue, assertion.operator, assertion.value);

    } catch (error) {
      passed = false;
      actualValue = `Error: ${error.message}`;
    }

    return {
      type: assertion.type,
      target: assertion.target,
      operator: assertion.operator,
      expected: assertion.value,
      actual: actualValue,
      passed,
      message: assertion.message || this.generateAssertionMessage(assertion, actualValue, passed),
    };
  }

  /**
   * Evaluate assertion based on operator
   */
  private evaluateAssertion(actual: any, operator: AssertionOperator, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;

      case 'contains':
        if (typeof actual === 'string') {
          return actual.includes(String(expected));
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;

      case 'matches':
        const regex = expected instanceof RegExp ? expected : new RegExp(expected);
        return regex.test(String(actual));

      case 'lessThan':
        return Number(actual) < Number(expected);

      case 'greaterThan':
        return Number(actual) > Number(expected);

      case 'exists':
        return actual !== undefined && actual !== null;

      case 'notExists':
        return actual === undefined || actual === null;

      default:
        throw new Error(`Unknown assertion operator: ${operator}`);
    }
  }

  /**
   * Extract value from JSON using path notation
   */
  private extractJsonPath(body: string | Buffer | undefined, path: string): any {
    if (!body) return undefined;

    try {
      const jsonData = typeof body === 'string' ? JSON.parse(body) : JSON.parse(body.toString());
      
      // Simple path extraction (e.g., "data.user.name")
      const pathParts = path.split('.');
      let current = jsonData;

      for (const part of pathParts) {
        if (current === null || current === undefined) {
          return undefined;
        }
        
        // Handle array indices
        if (part.includes('[') && part.includes(']')) {
          const [key, indexStr] = part.split('[');
          const index = parseInt(indexStr.replace(']', ''));
          current = current[key]?.[index];
        } else {
          current = current[part];
        }
      }

      return current;
    } catch (error) {
      throw new Error(`Failed to extract JSON path "${path}": ${error.message}`);
    }
  }

  /**
   * Generate assertion message
   */
  private generateAssertionMessage(
    assertion: APIAssertion,
    actualValue: any,
    passed: boolean
  ): string {
    const target = assertion.target ? ` (${assertion.target})` : '';
    const status = passed ? 'PASS' : 'FAIL';
    
    return `${status}: ${assertion.type}${target} ${assertion.operator} ${assertion.value} (actual: ${actualValue})`;
  }

  /**
   * Create failed test result
   */
  private createFailedResult(
    testCase: APITestCase,
    duration: number,
    error: string,
    retryCount = 0,
    response?: HTTPResponse | null
  ): APITestResult {
    return {
      testName: testCase.name,
      passed: false,
      duration,
      request: {
        url: testCase.request.url,
        method: testCase.request.method,
        timestamp: new Date(),
      },
      response: response ? {
        status: response.status,
        headers: response.headers,
        bodySize: response.size.body,
        timing: 0,
      } : undefined,
      assertions: [],
      error,
      retryCount,
    };
  }

  /**
   * Compile test suite result
   */
  private compileSuiteResult(
    suiteName: string,
    testResults: APITestResult[],
    duration: number
  ): APITestSuiteResult {
    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    const totalResponseTime = testResults
      .filter(r => r.response)
      .reduce((sum, r) => sum + (r.response?.timing || 0), 0);
    
    const totalRequests = testResults.filter(r => r.response).length;
    const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    const failedAssertions = testResults.reduce((sum, r) => 
      sum + r.assertions.filter(a => !a.passed).length, 0
    );

    return {
      suiteName,
      totalTests,
      passedTests,
      failedTests,
      duration,
      testResults,
      summary: {
        successRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
        averageResponseTime,
        totalRequests,
        failedAssertions,
      },
    };
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new MCPServerError(
          MCP_ERROR_CODES.TIMEOUT,
          `Test suite timed out after ${timeout}ms`
        ));
      }, timeout);
    });
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create test builder for fluent API
   */
  createTestBuilder(): APITestBuilder {
    return new APITestBuilder();
  }

  /**
   * Create test suite builder for fluent API
   */
  createTestSuiteBuilder(): APITestSuiteBuilder {
    return new APITestSuiteBuilder();
  }
}

/**
 * Fluent API Test Builder
 */
export class APITestBuilder {
  private testCase: Partial<APITestCase> = {
    assertions: [],
  };

  name(name: string): APITestBuilder {
    this.testCase.name = name;
    return this;
  }

  request(request: HTTPRequest): APITestBuilder {
    this.testCase.request = request;
    return this;
  }

  expectStatus(status: number, message?: string): APITestBuilder {
    this.testCase.assertions!.push({
      type: 'status',
      operator: 'equals',
      value: status,
      message,
    });
    return this;
  }

  expectHeader(name: string, value: string | RegExp, message?: string): APITestBuilder {
    this.testCase.assertions!.push({
      type: 'header',
      target: name,
      operator: value instanceof RegExp ? 'matches' : 'equals',
      value,
      message,
    });
    return this;
  }

  expectBodyContains(text: string, message?: string): APITestBuilder {
    this.testCase.assertions!.push({
      type: 'body',
      operator: 'contains',
      value: text,
      message,
    });
    return this;
  }

  expectResponseTime(maxMs: number, message?: string): APITestBuilder {
    this.testCase.assertions!.push({
      type: 'responseTime',
      operator: 'lessThan',
      value: maxMs,
      message,
    });
    return this;
  }

  expectJsonPath(path: string, value: any, operator: AssertionOperator = 'equals', message?: string): APITestBuilder {
    this.testCase.assertions!.push({
      type: 'jsonPath',
      target: path,
      operator,
      value,
      message,
    });
    return this;
  }

  retries(count: number, delay?: number): APITestBuilder {
    this.testCase.retries = count;
    if (delay) {
      this.testCase.retryDelay = delay;
    }
    return this;
  }

  setup(setupFn: () => Promise<void>): APITestBuilder {
    this.testCase.setup = setupFn;
    return this;
  }

  teardown(teardownFn: () => Promise<void>): APITestBuilder {
    this.testCase.teardown = teardownFn;
    return this;
  }

  build(): APITestCase {
    if (!this.testCase.name) {
      throw new Error('Test name is required');
    }
    if (!this.testCase.request) {
      throw new Error('Test request is required');
    }
    return this.testCase as APITestCase;
  }
}

/**
 * Fluent API Test Suite Builder
 */
export class APITestSuiteBuilder {
  private testSuite: Partial<APITestSuite> = {
    tests: [],
  };

  name(name: string): APITestSuiteBuilder {
    this.testSuite.name = name;
    return this;
  }

  addTest(test: APITestCase): APITestSuiteBuilder {
    this.testSuite.tests!.push(test);
    return this;
  }

  addTests(tests: APITestCase[]): APITestSuiteBuilder {
    this.testSuite.tests!.push(...tests);
    return this;
  }

  parallel(parallel = true): APITestSuiteBuilder {
    this.testSuite.parallel = parallel;
    return this;
  }

  stopOnFailure(stop = true): APITestSuiteBuilder {
    this.testSuite.stopOnFailure = stop;
    return this;
  }

  timeout(timeoutMs: number): APITestSuiteBuilder {
    this.testSuite.timeout = timeoutMs;
    return this;
  }

  setup(setupFn: () => Promise<void>): APITestSuiteBuilder {
    this.testSuite.setup = setupFn;
    return this;
  }

  teardown(teardownFn: () => Promise<void>): APITestSuiteBuilder {
    this.testSuite.teardown = teardownFn;
    return this;
  }

  build(): APITestSuite {
    if (!this.testSuite.name) {
      throw new Error('Test suite name is required');
    }
    if (!this.testSuite.tests || this.testSuite.tests.length === 0) {
      throw new Error('At least one test is required');
    }
    return this.testSuite as APITestSuite;
  }
}