import { beforeEach, describe, expect, it } from 'vitest';
import { renderProgressChart, renderAnalyticsCharts } from '../charts';
import type { Goal, GoalSession } from '../types';
import * as echarts from 'echarts';

describe('chart helpers', () => {
  beforeEach(() => {
    (echarts.init as any).mockClear();
  });

  it('renders progress chart with cumulative data', () => {
    const container = document.createElement('div');
    const sessions: GoalSession[] = [
      { id: 's1', goalId: 'g', startTime: Date.UTC(2024, 4, 1), endTime: Date.UTC(2024, 4, 1, 1), duration: 3_600_000, instanceId: 'test' },
      { id: 's2', goalId: 'g', startTime: Date.UTC(2024, 4, 2), endTime: Date.UTC(2024, 4, 2, 2), duration: 7_200_000, instanceId: 'test' }
    ];
    const chart = renderProgressChart(container, sessions, 'Goal', 50);
    expect(chart.setOption).toHaveBeenCalledTimes(1);
    const option = (chart.setOption as any).mock.calls[0][0];
    expect(option.series[0].name).toBe('Daily Hours');
    expect(option.series[1].name).toBe('Cumulative Progress');
  });

  it('renders analytics charts with summaries', () => {
    const trend = document.createElement('div');
    const pie = document.createElement('div');
    const now = Date.now();
    const sessions: GoalSession[] = [
      { id: 's1', goalId: 'g1', startTime: Date.UTC(2024, 4, 1), endTime: Date.UTC(2024, 4, 1, 1), duration: 3_600_000, instanceId: 'test' },
      { id: 's2', goalId: 'g2', startTime: Date.UTC(2024, 4, 2), endTime: Date.UTC(2024, 4, 2, 2), duration: 7_200_000, instanceId: 'test' }
    ];
    const goals: Goal[] = [
      {
        id: 'g1',
        title: 'One',
        description: '',
        totalHours: 10,
        totalTimeSpent: 1,
        isActive: false,
        isArchived: false,
        createdAt: now,
        lastModified: now,
        instanceId: 'test'
      },
      {
        id: 'g2',
        title: 'Two',
        description: '',
        totalHours: 10,
        totalTimeSpent: 1,
        isActive: false,
        isArchived: false,
        createdAt: now,
        lastModified: now,
        instanceId: 'test'
      }
    ];
    const charts = renderAnalyticsCharts(trend, pie, sessions, goals);
    expect(charts.trend.setOption).toHaveBeenCalled();
    expect(charts.pie.setOption).toHaveBeenCalled();
  });
});
