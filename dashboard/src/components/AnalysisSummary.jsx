import { useMemo, useState, useEffect } from 'react';
import { computeStats } from '../utils/analysis';
import { loadTemporalResults, loadAnomalyResults, loadClusteringResults, loadCorrelationResults } from '../utils/mlResults';

const typeStyles = {
  stats: 'border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/50',
  trend: 'border-cyan-200/60 bg-gradient-to-br from-cyan-50/80 to-teal-50/50',
  anomaly: 'border-rose-200/60 bg-gradient-to-br from-rose-50/80 to-pink-50/50',
  cluster: 'border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-purple-50/50',
  correlation: 'border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-green-50/50',
};

const typeIcons = {
  stats: '📊',
  trend: '📈',
  anomaly: '🔍',
  cluster: '🧩',
  correlation: '🔗',
};

export default function AnalysisSummary({ ntuData, phData, mergedData }) {
  const [mlTemporal, setMlTemporal] = useState(null);
  const [mlAnomaly, setMlAnomaly] = useState(null);
  const [mlClustering, setMlClustering] = useState(null);
  const [mlCorrelation, setMlCorrelation] = useState(null);

  useEffect(() => {
    loadTemporalResults().then(setMlTemporal);
    loadAnomalyResults().then(setMlAnomaly);
    loadClusteringResults().then(setMlClustering);
    loadCorrelationResults().then(setMlCorrelation);
  }, []);

  const insights = useMemo(() => {
    const results = [];
    if (!ntuData?.length && !phData?.length) return results;

    if (ntuData?.length) {
      const stats = computeStats(ntuData, 'NTU');
      results.push({
        title: 'NTU Distribution',
        type: 'stats',
        description: `Turbidity ranges from ${stats.min} to ${stats.max} NTU with a mean of ${stats.mean} (σ=${stats.std}).`,
      });

      const turb = mlTemporal?.per_sensor?.turbidity;
      if (turb) {
        const best = turb.best_model || {};
        results.push({
          title: 'NTU Temporal Trend (ML)',
          type: 'trend',
          description: `Best model: ${best.name || 'N/A'} (R²=${(best.r2 ?? 0).toFixed(4)}, MAE=${(best.mae ?? 0).toFixed(4)}).`,
        });
      }

      const anomTurb = mlAnomaly?.per_sensor?.turbidity;
      if (anomTurb) {
        const best = anomTurb.best_model || {};
        results.push({
          title: 'NTU Anomalies (ML)',
          type: 'anomaly',
          description: `Best model: ${best.name || 'N/A'} (F1=${(best.f1 ?? 0).toFixed(3)}, Precision=${(best.precision ?? 0).toFixed(3)}).`,
        });
      }

      const clustTurb = mlClustering?.per_sensor?.turbidity;
      if (clustTurb) {
        results.push({
          title: 'NTU Behavior Patterns (ML)',
          type: 'cluster',
          description: `K-Means optimal k=${clustTurb.optimal_k || 'N/A'}, silhouette=${(clustTurb.silhouette_score ?? 0).toFixed(3)}.`,
        });
      }
    }

    if (phData?.length) {
      const stats = computeStats(phData, 'pH');
      results.push({
        title: 'pH Distribution',
        type: 'stats',
        description: `pH ranges from ${stats.min} to ${stats.max} with a mean of ${stats.mean} (σ=${stats.std}).`,
      });
    }

    if (mlCorrelation?.correlation_matrices?.pearson) {
      const matrix = mlCorrelation.correlation_matrices.pearson;
      const turIdx = (mlCorrelation.features || []).indexOf('turbidity');
      const phIdx = (mlCorrelation.features || []).indexOf('ph');
      if (turIdx >= 0 && phIdx >= 0 && matrix[turIdx]) {
        const corr = matrix[turIdx][phIdx];
        const strength = Math.abs(corr) > 0.7 ? 'strong' : Math.abs(corr) > 0.4 ? 'moderate' : 'weak';
        results.push({
          title: 'NTU-pH Correlation (ML)',
          type: 'correlation',
          description: `Pearson r=${corr.toFixed(4)} indicates a ${strength} ${corr > 0 ? 'positive' : 'negative'} relationship.`,
        });
      }
    }

    return results;
  }, [ntuData, phData, mergedData, mlTemporal, mlAnomaly, mlClustering, mlCorrelation]);

  if (!insights.length) return null;

  return (
    <div className="glass-card p-6 fade-in-up">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-700">ML Analysis Summary</h3>
        <p className="text-xs text-slate-400 mt-0.5 font-medium">Key insights generated from trained models</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border ${typeStyles[insight.type]} transition-all hover:shadow-md`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{typeIcons[insight.type]}</span>
              <h4 className="text-sm font-bold text-slate-700">{insight.title}</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
