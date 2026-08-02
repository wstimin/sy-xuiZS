import { ProtocolType, TransportType, SecurityType } from '../types';

export interface RuleCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkTransportAllowed(protocol: ProtocolType, transport: TransportType): RuleCheckResult {
  if (protocol === 'Shadowsocks') {
    if (transport === 'TCP') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: '当前 Shadowsocks 实现仅支持 TCP 传输'
    };
  }

  return { allowed: true };
}

export function checkSecurityAllowed(
  protocol: ProtocolType,
  transport: TransportType,
  security: SecurityType
): RuleCheckResult {
  // 1. Reality Check
  if (security === 'Reality') {
    if (protocol !== 'VLESS') {
      return {
        allowed: false,
        reason: `Reality 仅支持 VLESS 协议，当前协议(${protocol})与 Reality 冲突`
      };
    }
    if (transport !== 'TCP') {
      return {
        allowed: false,
        reason: '当前稳定实现仅支持 VLESS + TCP + Reality'
      };
    }
  }

  // 2. Shadowsocks Check
  if (protocol === 'Shadowsocks') {
    if (security !== 'None') {
      return {
        allowed: false,
        reason: 'Shadowsocks 自身包含 AEAD 对称加密算法，外层通常无需配置 TLS 或 Reality'
      };
    }
  }

  // 3. Trojan Check
  if (protocol === 'Trojan') {
    if (security === 'Reality') {
      return {
        allowed: false,
        reason: 'Trojan 协议标准实现依赖原生 TLS，3-xui 中 Trojan 不支持 Reality 伪装'
      };
    }
  }

  return { allowed: true };
}

export function getRecommendedDefaults(protocol: ProtocolType): { transport: TransportType; security: SecurityType } {
  switch (protocol) {
    case 'VLESS':
      return { transport: 'TCP', security: 'Reality' };
    case 'VMess':
      return { transport: 'WebSocket', security: 'TLS' };
    case 'Trojan':
      return { transport: 'TCP', security: 'TLS' };
    case 'Shadowsocks':
      return { transport: 'TCP', security: 'None' };
  }
}
