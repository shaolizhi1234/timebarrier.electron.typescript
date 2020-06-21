import { ElementVue, StatDate, ChartMode } from "../types/vue-viewmodels";
import AV from "leancloud-storage";
import ecStat from "echarts-stat";
import echarts from "echarts";
import { UI } from "../vue-utils";
import { Ref } from "@vue/composition-api";
import _ from "lodash";
import StatPage from "./StatPage";

export default {
  /**
   * 初始化「矩形树图」
   */
  initRectangularTree: async (
    id: string,
    data: readonly { name: string; value: number }[],
    colormap: string[],
    planTreeDataIndex: Ref<number>
  ) => {
    const charts = document.getElementById(id) as HTMLDivElement;
    const myChart = charts ? echarts.init(charts) : null;

    const option = {
      color: colormap,
      series: [
        {
          top: "5%",
          left: "5%",
          right: "5%",
          bottom: "12%",
          type: "treemap",
          data: data,
          roam: false
        }
      ]
    };

    if (myChart !== null) {
      myChart.setOption(option as any);
    }
    if (myChart !== null) {
      myChart.resize();
    }
    if (myChart !== null) {
      myChart.off("click");
      myChart.on("click", function(params: any) {
        planTreeDataIndex.value = params.dataIndex - 1;
      });
    }
  },
  /**
   * 获取矩形树图的数据
   */
  mapRectangularTreeData: (
    map: Map<string, AV.Object>,
    chartMode: ChartMode
  ) => {
    const data: { name: string; value: number }[] = [];
    map.forEach(value => {
      data.push({
        name: value.attributes.name,
        value:
          chartMode === "tomato"
            ? value.attributes.todayTomatoNumber
            : UI.timeStampToHour(value.attributes.todayTotalTime)
      });
    });
    return data.sort((a, b) => b.value - a.value);
  },
  /**
   * 获取折线图的 Plan 的数据
   */
  mapLineChartData: (
    statDateList: readonly StatDate[],
    type: "plan" | "target" | "ability",
    chartMode: ChartMode
  ): Map<string, number[][]> => {
    const map: Map<string, number[][]> = new Map();

    statDateList.forEach(statDate => {
      let statList: AV.Object[] = [];
      if (type === "plan") {
        statList = statDate.statPlanList as AV.Object[];
      } else if (type === "target") {
        statList = statDate.statTargetList as AV.Object[];
      } else if (type === "ability") {
        statList = statDate.statAbilityList as AV.Object[];
      }
      statList.forEach(object => {
        map.set(object.attributes.name as string, []);
      });
    });

    statDateList.forEach(statDate => {
      let statList: AV.Object[] = [];
      if (type === "plan") {
        statList = statDate.statPlanList as AV.Object[];
      } else if (type === "target") {
        statList = statDate.statTargetList as AV.Object[];
      } else if (type === "ability") {
        statList = statDate.statAbilityList as AV.Object[];
      }
      map.forEach((objectList, name) => {
        objectList.push([UI.getTodayStartTimestamp(statDate.timeStamp), 0]);
        statList.forEach(statObject => {
          if (statObject.attributes.name === name) {
            objectList[objectList.length - 1] = [
              UI.getTodayStartTimestamp(statDate.timeStamp),
              chartMode === "tomato"
                ? statObject.attributes.todayTomatoNumber
                : UI.timeStampToHour(statObject.attributes.todayTotalTime)
            ];
          }
        });
      });
    });

    return map;
  },
  /**
   * 获取全部的统计数据
   * @param statDateList
   * @param type
   * @param chartMode
   */
  mapTotalStatData: function(
    statDateList: readonly StatDate[],
    type: "plan" | "target" | "ability",
    chartMode: ChartMode
  ) {
    const statDateListAsc = _.reverse(_.cloneDeep(statDateList));

    const map: Map<string, number[][]> = this.mapLineChartData(
      statDateListAsc,
      type,
      chartMode
    );

    map.forEach(list => {
      list.forEach((item, index) => {
        const todayValue = item[1];
        if (index === 0) {
          item[1] = Number(todayValue.toFixed(2));
        } else {
          item[1] = Number((list[index - 1][1] + todayValue).toFixed(2));
        }
      });
    });

    map.forEach((list, name) => {
      const lastItem = list[list.length - 1];
      const maxValue = lastItem[1];
      let totalValue: number = 0;

      try {
        statDateList.forEach(statDate => {
          let statList: AV.Object[] = [];

          if (type === "plan" && statDate.statPlanList !== undefined) {
            statList = statDate.statPlanList;
          } else if (
            type === "target" &&
            statDate.statTargetList !== undefined
          ) {
            statList = statDate.statTargetList;
          } else if (
            type === "ability" &&
            statDate.statAbilityList !== undefined
          ) {
            statList = statDate.statAbilityList;
          }

          statList.forEach(object => {
            if (object.attributes.name === name) {
              totalValue =
                chartMode === "tomato"
                  ? object.attributes.tomatoNumber
                  : UI.timeStampToHour(object.attributes.totalTime);
              throw "get totalValue success!!";
            }
          });
        });
      } catch (error) {
        const startValue =
          totalValue - maxValue >= 0 ? totalValue - maxValue : 0;
        list.forEach(item => {
          item[1] = Number((item[1] + startValue).toFixed(2));
        });
      }
    });

    return map;
  },
  /**
   * 获取 10000 小时定律达成时间
   */
  map10000HoursPrediction: function(
    totalStatData: Map<string, number[][]>,
    startTimeStamp: number
  ): {
    name: string;
    prediction: string;
    k?: number;
  }[] {
    const result: { name: string; prediction: string; k: number }[] = [];
    totalStatData.forEach((data, name) => {
      const expression = StatPage.getLinearRegressionExpression(data, "time");
      const k = StatPage.getLinearRegressionSlop(expression);
      const b = StatPage.getLinearRegressionIntercept(expression);
      const prediction = StatPage.get10000HoursDate(startTimeStamp, k, b);
      result.push({
        name: name,
        prediction: k === 0 ? `当前数据显示：永远无法达成` : prediction,
        k: k
      });
    });
    return result.sort((a, b) => b.k - a.k);
  },

  /**
   * 获取月份数据
   */
  mapMonthStatData: (
    statDateList: readonly StatDate[],
    chartMode: ChartMode,
    type: "plan" | "ability" | "target"
  ): Map<string, number[]> => {
    const map: Map<string, number[]> = new Map();
    statDateList.forEach(statDate => {
      let statList: AV.Object[] = [];
      if (type === "plan") {
        statList = statDate.statPlanList as AV.Object[];
      } else if (type === "ability") {
        statList = statDate.statAbilityList as AV.Object[];
      } else if (type === "target") {
        statList = statDate.statTargetList as AV.Object[];
      }
      statList.forEach(object => {
        // 1. 看看 object 是否已经在已经在 map 中
        if (map.has(object.attributes.name)) {
          // 若已经在 map 中
          const list = map.get(object.attributes.name) as number[];
          const { month, value } = getMonthAndValue(
            object,
            statDate,
            chartMode
          );
          list[month] = Number((list[month] + value).toFixed(2));
          map.set(object.attributes.name, list);
        } else {
          // 若不在 map 中，则加入到其中
          const list = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          const { month, value } = getMonthAndValue(
            object,
            statDate,
            chartMode
          );
          list[month] = value;
          map.set(object.attributes.name, list);
        }
      });
    });

    /**
     * 获取 object
     */
    function getMonthAndValue(
      object: AV.Object,
      statDate: StatDate,
      chartMode: ChartMode
    ): { month: number; value: number } {
      const month = new Date(statDate.timeStamp).getMonth();
      const value =
        chartMode === "tomato"
          ? object.attributes.todayTomatoNumber
          : Number(
              UI.timeStampToHour(object.attributes.todayTotalTime).toFixed(2)
            );
      return {
        month,
        value
      };
    }
    return map;
  },

  /**
   * 初始化月数据
   */
  initMonthBarChart: (
    id: string,
    monthStatDate: Map<string, number[]>,
    chartMode: ChartMode,
    colormap: string[],
    labelShow: Ref<boolean>
  ) => {
    const charts = document.getElementById(id) as HTMLDivElement;
    const myChart = charts ? echarts.init(charts) : null;

    const series: {
      name: string;
      data: number[];
      type: "bar";
      stack: "总量";
      showBackground: false;
      backgroundStyle: {
        color: "rgba(220, 220, 220, 0.2)";
      };
    }[] = [];

    const legend: string[] = [];

    monthStatDate.forEach((data, name) => {
      series.push({
        name: name,
        data: data,
        type: "bar",
        stack: "总量",
        showBackground: false,
        backgroundStyle: { color: "rgba(220, 220, 220, 0.2)" }
      });
    });

    function total(data: number[]) {
      let total = 0;
      data.forEach(item => {
        total += item;
      });
      return total;
    }

    series.sort((a, b) => total(b.data) - total(a.data));

    series.forEach(item => {
      legend.push(item.name);
    });

    const option = {
      color: colormap,
      grid: {
        left: "3.2%",
        right: "12%",
        bottom: "13%",
        containLabel: true
      },
      label: {
        show: labelShow.value
      },
      legend: {
        data: legend,
        type: "scroll",
        bottom: "0%",
        left: "2.5%",
        right: "2.5%",
        textStyle: {
          fontSize: 11
        }
      },
      xAxis: {
        name: "月份 x",
        type: "category",
        data: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        nameLocation: "end",
        nameGap: 6,
        nameTextStyle: {
          color: "#222A36",
          fontSize: 10
        },
        axisLine: { lineStyle: { color: "#99A8B8" } },
        axisLabel: { margin: 20, color: "#222A36", fontSize: 10 },
        splitLine: {
          lineStyle: {
            type: "dashed"
          }
        }
      },
      yAxis: {
        name: chartMode === "tomato" ? "番茄数 y" : "小时 y",
        nameLocation: "end",
        nameTextStyle: {
          color: "#222A36",
          fontSize: 10
        },
        axisLine: { lineStyle: { color: "#99A8B8" } },
        axisLabel: {
          margin: 20,
          color: "#222A36",
          fontSize: 10
        },
        type: "value",
        splitLine: {
          lineStyle: {
            type: "dashed"
          }
        }
      },
      series: series
    };

    if (myChart !== null) {
      myChart.setOption(option as any);
    }
    if (myChart !== null) {
      myChart.resize();
    }
    if (myChart !== null) {
      myChart.off("click");
      myChart.on("click", function(params: any) {
        if (labelShow.value == true) {
          labelShow.value = false;
        } else {
          labelShow.value = true;
        }
      });
    }
  },

  initLineChart: (
    id: string,
    lineChartData: Map<string, number[][]>,
    chartMode: ChartMode,
    colormap: string[],
    smooth: boolean,
    isLine: boolean
  ) => {
    const charts = document.getElementById(id) as HTMLDivElement;
    const myChart = charts ? echarts.init(charts) : null;

    const series: {
      name: string;
      type: string;
      smooth: boolean;
      data: number[][];
      symbolSize: number;
      stack?: string;
      areaStyle?: {};
    }[] = [];

    const legend: string[] = [];

    lineChartData.forEach((data, name) => {
      if (isLine) {
        series.push({
          name: name,
          type: "line",
          smooth: smooth,
          data: data,
          symbolSize: 1
        });
      } else {
        series.push({
          name: name,
          type: "line",
          smooth: smooth,
          areaStyle: {},
          data: data,
          symbolSize: 1
        });
      }

      legend.push(name);
    });

    series.sort((a, b) => {
      return b.data[b.data.length - 1][1] - a.data[a.data.length - 1][1];
    });

    // // See https://github.com/ecomfe/echarts-stat
    // var linearRegression = ecStat.regression("linear", data, 0);

    // linearRegression.points.sort(function(a: any, b: any) {
    //   return a[0] - b[0];
    // });

    const option = {
      color: colormap,
      grid: {
        left: "3.2%",
        right: "12%",
        bottom: "13%",
        containLabel: true
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross"
        }
      },
      legend: {
        data: legend,
        type: "scroll",
        bottom: "0%",
        left: "2.5%",
        right: "2.5%",
        textStyle: {
          fontSize: 11
        }
      },
      xAxis: {
        name: "日期 x",
        nameLocation: "end",
        nameGap: 6,
        nameTextStyle: {
          color: "#222A36",
          fontSize: 10
        },
        axisLine: { lineStyle: { color: "#99A8B8" } },
        axisLabel: { margin: 20, color: "#222A36", fontSize: 10 },
        type: "time",
        splitLine: {
          lineStyle: {
            type: "dashed"
          }
        },
        splitNumber: 5
      },
      yAxis: {
        name: chartMode === "tomato" ? "番茄数 y" : "小时 y",
        nameLocation: "end",
        nameTextStyle: {
          color: "#222A36",
          fontSize: 10
        },
        axisLine: { lineStyle: { color: "#99A8B8" } },
        axisLabel: {
          margin: 20,
          color: "#222A36",
          fontSize: 10
        },
        type: "value",
        splitLine: {
          lineStyle: {
            type: "dashed"
          }
        }
      },
      series: series
    };

    if (myChart !== null) {
      myChart.setOption(option as any, true);
    }
    if (myChart !== null) {
      myChart.resize();
    }
  },
  /**
   * 获取分月展示的数据，并且按照 chartMode 进行降序排列
   * 这将用于展示数据列表
   */
  getMonthStatData: function(
    statDateList: readonly StatDate[],
    type: "plan" | "ability" | "target"
  ): Map<
    string,
    { totalTime: number; totalTomatoNumber: number; percent: number }
  >[] {
    const result: Map<
      string,
      { totalTime: number; totalTomatoNumber: number; percent: number }
    >[] = [];

    for (let i = 0; i < 12; i++) {
      result.push(
        new Map<
          string,
          { totalTime: number; totalTomatoNumber: number; percent: number }
        >()
      );
    }

    const monthStatDataTime = this.mapMonthStatData(statDateList, "time", type);

    const monthStatDataTomato = this.mapMonthStatData(
      statDateList,
      "tomato",
      type
    );

    monthStatDataTime.forEach((objectList, name) => {
      objectList.forEach((totalTime, index) => {
        const currentLoopMonthMap = result[index];
        if (currentLoopMonthMap.has(name)) {
          const map = currentLoopMonthMap.get(name);
          const value = {
            totalTime: totalTime,
            totalTomatoNumber: map ? map.totalTomatoNumber : 0,
            percent: map ? map.percent : 0
          };
          currentLoopMonthMap.set(name, value);
        } else {
          const value = {
            totalTime: totalTime,
            totalTomatoNumber: 0,
            percent: 0
          };
          currentLoopMonthMap.set(name, value);
        }
      });
    });

    monthStatDataTomato.forEach((objectList, name) => {
      objectList.forEach((totalTomatoNumber, index) => {
        const currentLoopMonthMap = result[index];
        if (currentLoopMonthMap.has(name)) {
          const map = currentLoopMonthMap.get(name);
          const value = {
            totalTime: map ? map.totalTime : 0,
            totalTomatoNumber: totalTomatoNumber,
            percent: map ? map.percent : 0
          };
          currentLoopMonthMap.set(name, value);
        } else {
          const value = {
            totalTime: 0,
            totalTomatoNumber: totalTomatoNumber,
            percent: 0
          };
          currentLoopMonthMap.set(name, value);
        }
      });
    });

    const totalTimeList: number[] = [];
    result.forEach(map => {
      let totalTime = 0;
      map.forEach(value => {
        totalTime += value.totalTime;
      });
      totalTimeList.push(totalTime);
    });

    result.forEach((map, index) => {
      map.forEach(value => {
        value.percent = Number(
          (value.totalTime / totalTimeList[index]).toFixed(2)
        );
      });
    });

    return result;
  },
  /**
   * 获取矩形树图的数据，并且按照 chartMode 进行降序排列；
   * 这将用于展示数据列表
   */
  getTotalStatData: (
    statList: Map<string, AV.Object>,
    chartMode: ChartMode
  ): {
    name: string;
    totalTomatoNumber: number;
    totalTime: number;
  }[] => {
    const data: {
      name: string;
      totalTomatoNumber: number;
      totalTime: number;
    }[] = [];

    statList.forEach(value => {
      data.push({
        name: value.attributes.name,
        totalTomatoNumber: value.attributes.todayTomatoNumber,
        totalTime: UI.timeStampToHour(value.attributes.todayTotalTime)
      });
    });

    return chartMode === "tomato"
      ? data.sort((a, b) => b.totalTomatoNumber - a.totalTomatoNumber)
      : data.sort((a, b) => b.totalTime - a.totalTime);
  },
  /**
   * 获取线性图的数据，并按照 chartMode 进行降序排列；
   * 这将用于展示数据列表
   */
  getAverageDailyStatData: (
    statList: Map<string, AV.Object>,
    dateRange: Date[],
    chartMode: ChartMode
  ): {
    name: string;
    averageDailyTomatoNumber: number;
    averageDailyTime: number;
  }[] => {
    const data: {
      name: string;
      averageDailyTomatoNumber: number;
      averageDailyTime: number;
    }[] = [];

    const durationDays: number =
      (dateRange[1].getTime() - dateRange[0].getTime()) / (3600 * 1000 * 24);

    statList.forEach(value => {
      data.push({
        name: value.attributes.name,
        averageDailyTomatoNumber: Number(
          (value.attributes.todayTomatoNumber / durationDays).toFixed(2)
        ),
        averageDailyTime: Number(
          (
            UI.timeStampToHour(value.attributes.todayTotalTime) / durationDays
          ).toFixed(2)
        )
      });
    });
    return chartMode === "tomato"
      ? data.sort(
          (a, b) => b.averageDailyTomatoNumber - a.averageDailyTomatoNumber
        )
      : data.sort((a, b) => b.averageDailyTime - a.averageDailyTime);
  },
  /**
   * 获取矩形树图的 Tip：
   * 1. name：该段时间，总时间 / 总番茄数值量最大的 Plan / Ability / Target 的名字
   * 2. percent：其占据总体的百分比
   */
  getRectangularTreeTip: (
    treeData: {
      name: string;
      totalTomatoNumber: number;
      totalTime: number;
    }[],
    chartMode: ChartMode
  ): { name: string; percent: string } => {
    let totalTime = 0;
    let totalTomatoNumber = 0;
    let maxTime = 0;
    let maxTomatoNumber = 0;
    let maxTimeName = "";
    let maxTomatoNumberName = "";
    treeData.forEach(item => {
      totalTime += item.totalTime;
      totalTomatoNumber += item.totalTomatoNumber;
      if (maxTime <= item.totalTime) {
        maxTime = item.totalTime;
        maxTimeName = item.name;
      }
      if (maxTomatoNumber <= item.totalTomatoNumber) {
        maxTomatoNumber = item.totalTomatoNumber;
        maxTomatoNumberName = item.name;
      }
    });
    return chartMode === "tomato"
      ? {
          name: maxTomatoNumberName,
          percent: ((maxTomatoNumber / totalTomatoNumber) * 100).toFixed(2)
        }
      : {
          name: maxTimeName,
          percent: ((maxTime / totalTime) * 100).toFixed(2)
        };
  },
  /**
   * 获取 Ability 用于矩形树图
   */
  fetchStatAbilityList: (
    statDateList: readonly StatDate[]
  ): Map<string, AV.Object> => {
    const abilityMap = new Map();
    statDateList.forEach(statDate => {
      if (statDate.statAbilityList === undefined) {
        throw "statDate.statAbilityList === undefined";
      }
      statDate.statAbilityList.forEach(ability => {
        if (abilityMap.has(ability.id)) {
          const oldAbility = abilityMap.get(ability.id);
          oldAbility.attributes.todayTotalTime +=
            ability.attributes.todayTotalTime;
          oldAbility.attributes.todayTomatoNumber +=
            ability.attributes.todayTomatoNumber;
        } else {
          abilityMap.set(ability.id, _.cloneDeep(ability));
        }
      });
    });
    return abilityMap;
  },
  /**
   * 获取 Plan 用于矩形树图
   */
  fetchStatPlanList: (
    statDateList: readonly StatDate[]
  ): Map<string, AV.Object> => {
    const planMap = new Map();
    statDateList.forEach(statDate => {
      if (statDate.statPlanList === undefined) {
        throw "statDate.statPlanList === undefined";
      }
      statDate.statPlanList.forEach(plan => {
        if (planMap.has(plan.id)) {
          const oldPlan = planMap.get(plan.id);
          oldPlan.attributes.todayTotalTime += plan.attributes.todayTotalTime;
          oldPlan.attributes.todayTomatoNumber +=
            plan.attributes.todayTomatoNumber;
        } else {
          planMap.set(plan.id, _.cloneDeep(plan));
        }
      });
    });
    return planMap;
  },
  /**
   * 获取 Target 用于矩形树图
   */
  fetchStatTargetList: (
    statDateList: readonly StatDate[]
  ): Map<string, AV.Object> => {
    const targetMap = new Map();
    statDateList.forEach(statDate => {
      if (statDate.statTargetList === undefined) {
        throw "statDate.statTargetList === undefined";
      }
      statDate.statTargetList.forEach(target => {
        if (targetMap.has(target.id)) {
          const oldTarget = targetMap.get(target.id);
          oldTarget.attributes.todayTotalTime +=
            target.attributes.todayTotalTime;
          oldTarget.attributes.todayTomatoNumber +=
            target.attributes.todayTomatoNumber;
        } else {
          targetMap.set(target.id, _.cloneDeep(target));
        }
      });
    });
    return targetMap;
  }
};
