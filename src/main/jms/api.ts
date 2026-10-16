import type {
  ApiResult,
  AssetDetail,
  ConnectionToken,
  ConnectionTokenRequest,
  ConnectMethod,
  JmsTreeNode,
  SmartEndpoint,
  UserProfile
} from '@shared/types'
import { jmsRequest } from './http'

export const jmsApi = {
  profile(): Promise<ApiResult<UserProfile>> {
    return jmsRequest('/api/v1/users/profile/')
  },

  /** `key` boşsa üst düzey düğümler (tek kök varsa onun çocuklarıyla birlikte) döner. */
  treeChildren(key?: string): Promise<ApiResult<JmsTreeNode[]>> {
    return jmsRequest('/api/v1/perms/users/self/nodes/children-with-assets/tree/', {
      query: key ? { key } : undefined
    })
  },

  treeChildrenById(nodeId: string): Promise<ApiResult<JmsTreeNode[]>> {
    return jmsRequest('/api/v1/perms/users/self/nodes/children-with-assets/tree/', {
      query: { id: nodeId }
    })
  },

  treeSearch(keyword: string): Promise<ApiResult<JmsTreeNode[]>> {
    return jmsRequest('/api/v1/perms/users/self/assets/tree/', { query: { search: keyword } })
  },

  treeAsset(assetId: string): Promise<ApiResult<JmsTreeNode[]>> {
    return jmsRequest('/api/v1/perms/users/self/assets/tree/', { query: { id: assetId } })
  },

  assetDetail(assetId: string): Promise<ApiResult<AssetDetail>> {
    return jmsRequest(`/api/v1/perms/users/self/assets/${encodeURIComponent(assetId)}/`)
  },

  connectionToken(req: ConnectionTokenRequest): Promise<ApiResult<ConnectionToken>> {
    return jmsRequest('/api/v1/authentication/connection-token/', {
      method: 'POST',
      body: {
        input_username: '',
        input_secret: '',
        input_secret_type: 'password',
        connect_options: {},
        ...req
      }
    })
  },

  exchangeToken(tokenId: string): Promise<ApiResult<ConnectionToken>> {
    return jmsRequest('/api/v1/authentication/connection-token/exchange/', {
      method: 'POST',
      body: { id: tokenId }
    })
  },

  connectMethods(assetId: string): Promise<ApiResult<Record<string, ConnectMethod[]>>> {
    const os =
      process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
    return jmsRequest('/api/v1/terminal/components/connect-methods/', {
      query: { os, asset_id: assetId }
    })
  },

  smartEndpoint(params: {
    protocol: string
    assetId?: string
    token?: string
  }): Promise<ApiResult<SmartEndpoint>> {
    return jmsRequest('/api/v1/terminal/endpoints/smart/', {
      query: { protocol: params.protocol, asset_id: params.assetId, token: params.token }
    })
  }
}
