import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/App.js';

function createMockHealthResponse(tablesCount: number): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      database: 'connected',
      tablesInitialized: tablesCount,
      memoryUsageMb: 42.5,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Hebrew RTL Application Shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Hebrew RTL shell and displays live API health status', async () => {
    // Arrange
    const expectedTables = 7;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockHealthResponse(expectedTables),
    );

    // Act
    const { container } = render(<App />);

    // Assert
    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('health-indicator')).toHaveTextContent(
        `מחובר לשרת (${expectedTables} טבלאות)`,
      );
    });
  });

  it('switches the active workflow section when a navigation tab is clicked', () => {
    // Arrange
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockHealthResponse(7),
    );
    render(<App />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: /תיבת סיווג/i }));

    // Assert
    expect(
      screen.getByRole('heading', { name: /תיבת סיווג מהיר/i }),
    ).toBeInTheDocument();
  });
});
