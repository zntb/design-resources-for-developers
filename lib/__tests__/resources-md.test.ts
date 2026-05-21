// Unit tests for resources-md functions
import { addLinkToResourcesMD } from '../resources-md';
import { readFileSync, existsSync, writeFileSync } from 'fs';

// Mock the file system functions
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('resources-md functions', () => {
  const mockContent = `## Table of Contents

## Others

> Uncategorized Stuff

| Website&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; | Description                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Existing Link](https://existing.com) | An existing link for testing                                                                                                                   |

<div align="right">
    <b><a href="#table-of-contents">↥ Back To Top</a></b>
</div>`;

  let writtenContent: string | null = null;

  beforeEach(() => {
    // Reset mocks before each test
    writtenContent = null;
    (existsSync as jest.Mock).mockReturnValue(true);
    (readFileSync as jest.Mock).mockImplementation(() => {
      if (writtenContent !== null) {
        return writtenContent;
      }
      return mockContent;
    });
    (writeFileSync as jest.Mock).mockImplementation((path, content) => {
      writtenContent = content;
    });
  });

  describe('addLinkToResourcesMD', () => {
    it('should add a new link to the Others section', () => {
      const testLink = {
        title: 'Test Link',
        url: 'https://example.com',
        description: 'A test link for verification',
      };

      const result = addLinkToResourcesMD(
        'test-category-id',
        'others',
        'Others',
        testLink,
      );

      console.log('Result:', result);

      // If it fails, let's see why
      if (!result.success) {
        console.log('Error:', result.error);
        console.log('Written content:', writtenContent);
      }

      expect(result.success).toBe(true);
      expect(result.message).toContain('Added link');

      // Verify that writeFileSync was called
      expect(writeFileSync).toHaveBeenCalled();

      // Get the content that was written
      const finalWrittenContent = writtenContent;

      // Verify the new link was added
      expect(finalWrittenContent).toContain('[Test Link](https://example.com)');
    });

    it('should not add duplicate links', () => {
      const existingLink = {
        title: 'Existing Link',
        url: 'https://existing.com',
        description: 'An existing link',
      };

      const result = addLinkToResourcesMD(
        'test-category-id',
        'others',
        'Others',
        existingLink,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });
});
