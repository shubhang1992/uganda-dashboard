import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './DemographicsCard.module.css';

const AGE_KEYS = ['18-25', '26-35', '36-45', '46-55', '56+'];
const AGE_COLORS = ['#2F8F9D', '#5E63A8', '#292867', '#8A90A6', '#D9DCF2'];
const GENDER_COLORS = { male: '#292867', female: '#2F8F9D' };

function AgeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{payload[0].payload.age}</span>
      <span className={styles.tooltipValue}>{payload[0].value} subscribers</span>
    </div>
  );
}

export default function DemographicsCard({ agents = [] }) {
  const { gender, ageData } = useMemo(() => {
    let male = 0, female = 0;
    const ageBuckets = [0, 0, 0, 0, 0];

    agents.forEach((agent) => {
      const m = agent.metrics || {};
      const gr = m.genderRatio || {};
      male += gr.male || 0;
      female += gr.female || 0;
      const ad = m.ageDistribution || {};
      AGE_KEYS.forEach((key, i) => { ageBuckets[i] += ad[key] || 0; });
    });

    const total = male + female || 1;
    return {
      gender: {
        male, female, total: male + female,
        malePct: Math.round((male / total) * 100),
        femalePct: Math.round((female / total) * 100),
        donutData: [
          { name: 'Male', value: male },
          { name: 'Female', value: female },
        ].filter(d => d.value > 0),
      },
      ageData: AGE_KEYS.map((key, i) => ({
        age: key,
        count: ageBuckets[i],
        fill: AGE_COLORS[i],
      })),
    };
  }, [agents]);

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5, ease: EASE_OUT_EXPO }}
    >
      <h3 className={styles.title}>Demographics</h3>

      <div className={styles.content}>
        {/* Gender donut */}
        <div className={styles.genderSection}>
          <div className={styles.donutWrap}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={gender.donutData.length > 0 ? gender.donutData : [{ name: 'Empty', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={gender.donutData.length > 1 ? 4 : 0}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                  stroke="none"
                >
                  {gender.donutData.length > 0
                    ? gender.donutData.map((entry) => (
                        <Cell key={entry.name} fill={GENDER_COLORS[entry.name.toLowerCase()]} />
                      ))
                    : <Cell fill="rgba(41,40,103,0.06)" />
                  }
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.donutCenter}>
              <span className={styles.donutTotal}>{gender.total.toLocaleString()}</span>
              <span className={styles.donutLabel}>Total</span>
            </div>
          </div>
          <div className={styles.genderLegend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: GENDER_COLORS.male }} />
              <span className={styles.legendText}>Male</span>
              <span className={styles.legendPct}>{gender.malePct}%</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: GENDER_COLORS.female }} />
              <span className={styles.legendText}>Female</span>
              <span className={styles.legendPct}>{gender.femalePct}%</span>
            </div>
          </div>
        </div>

        {/* Age distribution bar chart */}
        <div className={styles.ageSection}>
          <span className={styles.ageTitle}>Age Distribution</span>
          <div className={styles.ageChartWrap}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={ageData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="20%">
                <XAxis
                  dataKey="age"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#8A90A6', fontFamily: 'Inter' }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#8A90A6', fontFamily: 'Inter' }}
                  allowDecimals={false}
                />
                <Tooltip content={<AgeTooltip />} cursor={{ fill: 'rgba(41,40,103,0.03)' }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {ageData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
