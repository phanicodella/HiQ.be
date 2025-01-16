// src/services/enhancedAnalysis.service.js
import { openAIService } from './openai.service.js';
import { huggingFaceService } from './huggingface.service.js';
import { cohereService } from './cohere.service.js';

class EnhancedAnalysisService {
  constructor() {
    this.services = {
      openai: openAIService,
      huggingface: huggingFaceService,
      cohere: cohereService
    };
  }

  async analyzeInterview(questionHistory) {
    const results = [];
    const errors = [];

    // Try each service
    for (const [name, service] of Object.entries(this.services)) {
      try {
        const result = await service.analyzeInterview(questionHistory);
        results.push({ name, result });
      } catch (error) {
        console.error(`${name} analysis error:`, error);
        errors.push({ name, error });
      }
    }

    if (results.length === 0) {
      throw new Error('All analysis services failed');
    }

    // Combine and normalize results
    return this.combineResults(results);
  }

  combineResults(results) {
    // Weight the results based on service reliability
    const weights = {
      openai: 0.4,
      huggingface: 0.3,
      cohere: 0.3
    };

    // Calculate weighted scores
    const scores = {
      overall_score: 0,
      technical_competency: 0,
      communication_skills: 0
    };

    let totalWeight = 0;
    results.forEach(({ name, result }) => {
      const weight = weights[name];
      totalWeight += weight;

      scores.overall_score += (result.overall_score * weight);
      scores.technical_competency += (result.technical_competency * weight);
      scores.communication_skills += (result.communication_skills * weight);
    });

    // Normalize scores
    Object.keys(scores).forEach(key => {
      scores[key] = Math.round((scores[key] / totalWeight) * 10) / 10;
    });

    // Combine qualitative feedback
    const strengths = new Set();
    const improvements = new Set();
    results.forEach(({ result }) => {
      result.key_strengths?.forEach(s => strengths.add(s));
      result.areas_for_improvement?.forEach(i => improvements.add(i));
    });

    return {
      ...scores,
      key_strengths: Array.from(strengths).slice(0, 5),
      areas_for_improvement: Array.from(improvements).slice(0, 5),
      hiring_recommendation: this.determineHiringRecommendation(scores.overall_score),
      feedback_summary: this.generateFeedbackSummary(scores, strengths, improvements)
    };
  }

  determineHiringRecommendation(score) {
    if (score >= 8.5) return 'strong_yes';
    if (score >= 7) return 'yes';
    if (score >= 5.5) return 'maybe';
    return 'no';
  }

  generateFeedbackSummary(scores, strengths, improvements) {
    // Generate a comprehensive summary
    const summary = [
      `The candidate demonstrated ${scores.overall_score >= 7 ? 'strong' : 'moderate'} performance overall.`,
      `Technical competency was ${this.scoreToText(scores.technical_competency)},`,
      `while communication skills were ${this.scoreToText(scores.communication_skills)}.`,
      strengths.size > 0 ? `Key strengths include ${Array.from(strengths).slice(0, 3).join(', ')}.` : '',
      improvements.size > 0 ? `Areas for improvement include ${Array.from(improvements).slice(0, 3).join(', ')}.` : ''
    ].filter(Boolean).join(' ');

    return summary;
  }

  scoreToText(score) {
    if (score >= 8.5) return 'exceptional';
    if (score >= 7) return 'strong';
    if (score >= 5.5) return 'satisfactory';
    if (score >= 4) return 'moderate';
    return 'needs improvement';
  }
}

export const enhancedAnalysisService = new EnhancedAnalysisService();
