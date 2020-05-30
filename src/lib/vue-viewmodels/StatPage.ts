import { Ref } from "@vue/composition-api";
import { StatStatusMode, StatDate } from "@/lib/types/vue-viewmodels";
import { ElementVue } from "@/lib/types/vue-viewmodels";
import { UI } from "@/lib/vue-utils";
import AV from "leancloud-storage";
import Api from "@/lib/api";
import _ from "lodash";

export default {
  /**
   * 加载 TomatoList 的前 100 条，越靠后创建的，越先加载出来
   */
  initTomatoList: async (vue: ElementVue, tomatoList: Ref<AV.Object[]>) => {
    // 获取传入参数
    const user = Api.getCurrentUser();

    // 如果未登录，提示用户请先登录
    if (user === null) {
      UI.showNotification(vue.$notify, "尚未登录", "请先去登录", "warning");
      return;
    }

    const loadingInstance = UI.showLoading(vue.$loading, "正在获取番茄列表");

    try {
      tomatoList.value = await Api.fetchTomatoList(user);
      UI.hideLoading(loadingInstance);
    } catch (error) {
      UI.hideLoading(loadingInstance);
      UI.showNotification(
        vue.$notify,
        "获取番茄列表失败",
        `错误原因：${error.message}`,
        "error"
      );
    }
  },
  /**
   * 加载更多
   */
  loadMore: async (vue: ElementVue, tomatoList: Ref<AV.Object[]>) => {
    // 获取传入参数
    const user = Api.getCurrentUser();

    // 如果未登录，提示用户请先登录
    if (user === null) {
      UI.showNotification(vue.$notify, "尚未登录", "请先去登录", "warning");
      return;
    }

    // const loadingInstance = UI.showLoading(vue.$loading, "正在加载更多");

    try {
      const oldTomatoList = tomatoList.value;
      const lastTomato = _.last(oldTomatoList);
      const newTomatoList = await Api.fetchTomatoList(
        user,
        lastTomato === undefined ? new Date() : lastTomato.attributes.startTime
      );
      tomatoList.value = _.concat(oldTomatoList, newTomatoList);
      // UI.hideLoading(loadingInstance);
    } catch (error) {
      // UI.hideLoading(loadingInstance);
      UI.showNotification(
        vue.$notify,
        "加载更多记录失败",
        `错误原因：${error.message}`,
        "error"
      );
    }
  },
  /**
   * 加载指定日期范围的 tomatoList
   */
  initTomatoListWithDateRange: async (
    vue: ElementVue,
    tomatoListWithDateRange: Ref<AV.Object[]>,
    startTime: Date,
    endTime: Date
  ) => {
    // 获取传入参数
    const user = Api.getCurrentUser();

    // 如果未登录，提示用户请先登录
    if (user === null) {
      UI.showNotification(vue.$notify, "尚未登录", "请先去登录", "warning");
      return;
    }
    const loadingInstance = UI.showLoading(vue.$loading, "正在获取番茄列表");

    try {
      tomatoListWithDateRange.value = await Api.fetchTomatoListWithDateRange(
        user,
        startTime,
        endTime
      );
      UI.hideLoading(loadingInstance);
    } catch (error) {
      UI.hideLoading(loadingInstance);
      UI.showNotification(
        vue.$notify,
        "获取番茄列表失败",
        `错误原因：${error.message}`,
        "error"
      );
    }
  },
  /**
   * 将 tomatoList 转换成 StatDateList
   */
  mapStatDate: (tomatoList: AV.Object[]): StatDate[] => {
    const statDateList: StatDate[] = [];

    // 将 tomatoList 转换为 statDateList
    let tDate: string = "";
    tomatoList.forEach(tomato => {
      if (tDate !== UI.dateToYearMonthDay(tomato.attributes.startTime)) {
        tDate = UI.dateToYearMonthDay(tomato.attributes.startTime);
        const statDate = createStatDate(tomato);
        statDateList.push(statDate);
      } else {
        statDateList[statDateList.length - 1].tomatoList.push(tomato);
      }
    });

    function createStatDate(tomato: AV.Object): StatDate {
      return {
        date: UI.dateToYearMonthDay(tomato.attributes.startTime),
        timeStamp: tomato.attributes.startTime.getTime(),
        tomatoList: [tomato]
      };
    }
    /**
     * 解析 statDateList.tomatoList 属性，获取其它相关属性
     * @param statDateList
     */
    function parseTomatoList(statDateList: StatDate[]) {
      const getDuration = (tomato: AV.Object) =>
        (tomato.createdAt as Date).getTime() -
        tomato.attributes.startTime.getTime();

      const getTotalTime = (tomatoList: AV.Object[]) => {
        let totalTime = 0;
        tomatoList.forEach(tomato => {
          totalTime += getDuration(tomato);
        });
        return totalTime;
      };

      /**
       * @return statTomatoList
       * statTomato.attributes.todayTomatoNumber - 今日番茄数量
       * statTomato.attributes.todayTotalTime - 今日番茄时间
       */
      const getStatTomatoList = (tomatoList: AV.Object[]): AV.Object[] => {
        const statTomatoList: AV.Object[] = [];
        tomatoList.forEach(tomato => {
          let tIndex = -1;

          statTomatoList.forEach((statTomato, index) => {
            if (statTomato.attributes.name === tomato.attributes.name) {
              tIndex = index;
            }
          });

          if (tIndex === -1) {
            const statTomato = _.cloneDeep(tomato);
            statTomato.attributes.todayTomatoNumber = 1;
            statTomato.attributes.todayTotalTime = getDuration(tomato);
            statTomatoList.push(statTomato);
          } else {
            statTomatoList[tIndex].attributes.todayTomatoNumber++;
            statTomatoList[tIndex].attributes.todayTotalTime += getDuration(
              tomato
            );
          }
        });
        return statTomatoList;
      };

      const getStatPlanList = (tomatoList: AV.Object[]): AV.Object[] => {
        const statPlanList: AV.Object[] = [];
        tomatoList.forEach(tomato => {
          tomato.attributes.planListOfTomato.forEach((plan: AV.Object) => {
            let tIndex = -1;

            statPlanList.forEach((statPlan, index) => {
              if (statPlan.id === plan.id) {
                tIndex = index;
              }
            });

            if (tIndex === -1) {
              const statPlan = _.cloneDeep(plan);
              statPlan.attributes.todayTomatoNumber = 1;
              statPlan.attributes.todayTotalTime = getDuration(tomato);
              statPlanList.push(statPlan);
            } else {
              statPlanList[tIndex].attributes.todayTomatoNumber++;
              statPlanList[tIndex].attributes.todayTotalTime += getDuration(
                tomato
              );
            }
          });
        });
        return statPlanList;
      };

      const getStatAbilityList = (tomatoList: AV.Object[]): AV.Object[] => {
        const statAbilityList: AV.Object[] = [];
        tomatoList.forEach(tomato => {
          tomato.attributes.planListOfTomato.forEach((plan: AV.Object) => {
            plan.attributes.abilityListOfPlan.forEach((ability: AV.Object) => {
              let tIndex = -1;

              statAbilityList.forEach((statAbility, index) => {
                if (statAbility.id === ability.id) {
                  tIndex = index;
                }
              });

              if (tIndex === -1) {
                const statAbility = _.cloneDeep(ability);
                statAbility.attributes.todayTomatoNumber = 1;
                statAbility.attributes.todayTotalTime = getDuration(tomato);
                statAbilityList.push(statAbility);
              } else {
                statAbilityList[tIndex].attributes.todayTomatoNumber++;
                statAbilityList[
                  tIndex
                ].attributes.todayTotalTime += getDuration(tomato);
              }
            });
          });
        });
        return statAbilityList;
      };

      const getStatTargetList = (tomatoList: AV.Object[]): AV.Object[] => {
        const statTargetList: AV.Object[] = [];
        tomatoList.forEach(tomato => {
          tomato.attributes.planListOfTomato.forEach((plan: AV.Object) => {
            plan.attributes.targetListOfPlan.forEach((target: AV.Object) => {
              let tIndex = -1;

              statTargetList.forEach((statTarget, index) => {
                if (statTarget.id === target.id) {
                  tIndex = index;
                }
              });

              if (tIndex === -1) {
                const statTarget = _.cloneDeep(target);
                statTarget.attributes.todayTomatoNumber = 1;
                statTarget.attributes.todayTotalTime = getDuration(tomato);
                statTargetList.push(statTarget);
              } else {
                statTargetList[tIndex].attributes.todayTomatoNumber++;
                statTargetList[tIndex].attributes.todayTotalTime += getDuration(
                  tomato
                );
              }
            });
          });
        });
        return statTargetList;
      };

      statDateList.forEach(statDate => {
        statDate.totalTime = getTotalTime(statDate.tomatoList);
        statDate.statTomatoList = getStatTomatoList(statDate.tomatoList);
        statDate.statPlanList = getStatPlanList(statDate.tomatoList);
        statDate.statAbilityList = getStatAbilityList(statDate.tomatoList);
        statDate.statTargetList = getStatTargetList(statDate.tomatoList);
      });
    }

    parseTomatoList(statDateList);

    return statDateList;
  },
  /**
   * 初始化 DailyTomatoList，这主要是用用来获取 totalTargetTomatoNumber 的
   */
  initDailyTomatoList: async (
    vue: ElementVue,
    dailyPlanList: Ref<AV.Object[]>
  ) => {
    // 获取传入参数
    const user = Api.getCurrentUser();

    // 如果未登录，提示用户请先登录
    if (user === null) {
      UI.showNotification(vue.$notify, "尚未登录", "请先去登录", "warning");
      return;
    }

    // 显示 loading
    const loadingInstance = UI.showLoading(vue.$loading, "正在获取计划列表");

    // 尝试获取计划列表
    try {
      // 获取每日计划列表
      if (dailyPlanList !== null) {
        dailyPlanList.value = await Api.fetchPlanList(user, "daily");
      }

      // 获取列表成功
      UI.hideLoading(loadingInstance);
    } catch (error) {
      UI.hideLoading(loadingInstance);
      UI.showNotification(
        vue.$notify,
        "获取计划列表失败",
        `失败原因：${error.message}`,
        "error"
      );
    }
  },
  /**
   * 点击「转换」按钮，改变数据呈现样式
   */
  changeStatStatusMode: (statStatusMode: Ref<StatStatusMode>) => {
    switch (statStatusMode.value) {
      case "detail":
        statStatusMode.value = "date";
        break;
      case "simple":
        statStatusMode.value = "detail";
        break;
      case "date":
        statStatusMode.value = "simple";
        break;
    }
  },
  /**
   * DateTip 是关于提示用户当前时间范围的函数
   * 如「本周」、「本月」、「本年」、「全部」、「自定义」
   */
  getDateTip: (startTime: Date, endTime: Date) => {
    if (
      startTime.getTime() === UI.getWeekStartTimestamp(new Date().getTime()) &&
      endTime.getTime() === UI.getTodayStartTimestamp(new Date().getTime())
    ) {
      return "本周";
    }

    // 本月
    else if (
      startTime.getTime() === UI.getMonthStartTimestamp(new Date().getTime()) &&
      endTime.getTime() === UI.getTodayStartTimestamp(new Date().getTime())
    ) {
      return "本月";
    }

    // 本年
    else if (
      startTime.getTime() === UI.getYearStartTimestamp(new Date().getTime()) &&
      endTime.getTime() === UI.getTodayStartTimestamp(new Date().getTime())
    ) {
      return "本年";
    }

    // 全部
    else if (
      startTime.getTime() === new Date("1990/01/01").getTime() &&
      endTime.getTime() === UI.getTodayStartTimestamp(new Date().getTime())
    ) {
      return "全部";
    }

    // 自定义
    else {
      return "自定义";
    }
  }
};
