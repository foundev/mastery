import * as echarts from 'echarts';
import type { Goal, GoalSession } from './types';
import { millisecondsToHours } from './time';

function ensureChart(dom: HTMLElement): echarts.ECharts {
  const existing = echarts.getInstanceByDom(dom);
  if (existing) {
    existing.dispose();
  }
  return echarts.init(dom);
}

export function renderProgressChart(
  container: HTMLElement,
  sessions: GoalSession[],
  goalTitle: string,
  totalHours: number
): echarts.ECharts {
  const dailyTotals = new Map<string, number>();
  sessions.forEach((session) => {
    const key = new Date(session.startTime).toDateString();
    const hours = millisecondsToHours(session.duration);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + hours);
  });

  const sortedDates = Array.from(dailyTotals.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  let cumulative = 0;
  const dailyData = sortedDates.map((date) => {
    const hours = dailyTotals.get(date) ?? 0;
    cumulative += hours;
    return { date, hours, cumulative };
  });

  const chart = ensureChart(container);
  chart.setOption({
    title: { text: `Progress: ${goalTitle}`, left: 'center', textStyle: { fontSize: 16 } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const dataPoint = params[0];
        const cumulativeHours = dataPoint?.data?.cumulative ?? 0;
        const progress = totalHours > 0 ? (cumulativeHours / totalHours) * 100 : 0;
        return `<div><strong>${dataPoint.name}</strong><br/>Daily: ${dataPoint.value.toFixed(
          1
        )}h<br/>Cumulative: ${cumulativeHours.toFixed(
          1
        )}h<br/>Progress: ${progress.toFixed(1)}%</div>`;
      }
    },
    xAxis: {
      type: 'category',
      data: dailyData.map((item) => {
        const dt = new Date(item.date);
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
      })
    },
    yAxis: [
      { type: 'value', name: 'Hours', position: 'left', axisLabel: { formatter: '{value}h' } },
      { type: 'value', name: 'Progress %', position: 'right', max: 100, axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: 'Daily Hours',
        type: 'bar',
        data: dailyData.map((item) => ({ value: Number(item.hours.toFixed(2)), cumulative: item.cumulative })),
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: 'Cumulative Progress',
        type: 'line',
        yAxisIndex: 1,
        data: dailyData.map((item) =>
          totalHours > 0 ? Number(((item.cumulative / totalHours) * 100).toFixed(1)) : 0
        ),
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6
      }
    ],
    grid: { right: '20%' },
    legend: { data: ['Daily Hours', 'Cumulative Progress'], bottom: 10 }
  });

  return chart;
}

export function renderAnalyticsCharts(
  trendContainer: HTMLElement,
  pieContainer: HTMLElement,
  sessions: GoalSession[],
  goals: Goal[]
): { trend: echarts.ECharts; pie: echarts.ECharts } {
  const dailyTotals = new Map<string, number>();
  sessions.forEach((session) => {
    const key = new Date(session.startTime).toDateString();
    const hours = millisecondsToHours(session.duration);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + hours);
  });

  const dates = Array.from(dailyTotals.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const trendSeries = dates.map((date) =>
    Number((dailyTotals.get(date) ?? 0).toFixed(2))
  );

  const trend = ensureChart(trendContainer);
  trend.setOption({
    title: { text: 'Daily Time Trend', left: 'center', textStyle: { fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dates.map((date) => {
        const dt = new Date(date);
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
      })
    },
    yAxis: { type: 'value', name: 'Hours' },
    series: [{ type: 'line', data: trendSeries, smooth: true, areaStyle: {}, color: '#3b82f6' }],
    grid: { left: 48, right: 16, top: 48, bottom: 40 }
  });

  const byGoal = new Map<string, number>();
  sessions.forEach((session) => {
    const hours = millisecondsToHours(session.duration);
    byGoal.set(session.goalId, (byGoal.get(session.goalId) ?? 0) + hours);
  });

  const pieData = Array.from(byGoal.entries()).map(([goalId, hours]) => {
    const goal = goals.find((g) => g.id === goalId);
    return { name: goal?.title ?? goalId, value: Number(hours.toFixed(2)) };
  });

  const pie = ensureChart(pieContainer);
  pie.setOption({
    title: { text: 'Time by Goal', left: 'center', textStyle: { fontSize: 16 } },
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['35%', '70%'],
        data: pieData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        }
      }
    ]
  });

  return { trend, pie };
}
