<template>
    <div>
        <div style="height:calc(100vh - 60px);"><!-- The size of the parent element determines the size of the graph. -->
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
                :on-node-click="onNodeClick"
                :on-line-click="onLineClick"
            />
        </div>
    </div>
</template>

<script>
// relation-graph also supports usage in the main.js file with Vue.use(RelationGraph); this way, you don't need the following line of code for import.
import RelationGraph from 'relation-graph'
export default {
    name: 'Demo',
    components: { RelationGraph },
    data() {
        return {
            graphOptions: {
                defaultJunctionPoint: 'border'
                // Here you can refer to the options in "Graph" for setting:
                // https://www.relation-graph.com/#/docs/graph
                // You can also use this GUI tool to generate configuration content.
                // https://www.relation-graph.com/#/options-tools
            }
        }
    },
    mounted() {
        this.showGraph()
    },
    methods: {
        showGraph() {
            const jsonData = {
                rootId: 'a',
                nodes: [
                    // You can also use slots directly without defining these cumbersome attributes and use CSS styles to define the appearance of your nodes.
                    // Example of using slots: https://www.relation-graph.com/#/demo/node-style
                    { id: 'a', text: 'A', borderColor: 'yellow' },
                    { id: 'b', text: 'B', color: '#43a2f1', fontColor: 'yellow' },
                    { id: 'c', text: 'C', nodeShape: 1, width: 80, height: 60 },
                    { id: 'e', text: 'E', nodeShape: 0, width: 150, height: 150 }
                ],
                lines: [
                    { from: 'a', to: 'b', text: 'line1', color: '#43a2f1' },
                    { from: 'a', to: 'c', text: 'line2' },
                    { from: 'a', to: 'e', text: 'line3' },
                    { from: 'b', to: 'e', color: '#67C23A' }
                ]
            }
            // The node and line in the above data can refer to the options in "Node" and "Link & Line" for configuration.
            // Node: https://www.relation-graph.com/#/docs/node
            // Link & Line: https://www.relation-graph.com/#/docs/link

            this.$refs.graphRef.setJsonData(jsonData, (graphInstance) => {
                // Called when the relation-graph is completed
            });
            // The this.refs.graphRef.setJsonData(jsonData, callback) method is a convenient method that is equivalent to the following code:
            //  const graphInstance = this.refs.graphRef.getInstance();
            //  graphInstance.addNodes(jsonData.nodes);
            //  graphInstance.addLines(jsonData.lines);
            //  graphInstance.rootNode = graphInstance.getNodeById(jsonData.rootId);
            //  await graphInstance.doLayout(); // Layout using the layouter set in graphOptions
            //  await graphInstance.moveToCenter(); // Find the center based on node distribution and center the view
            //  await graphInstance.zoomToFit(); // Zoom to fit, so that all nodes can be displayed in the visible area
        },
        onNodeClick(nodeObject, $event) {
            console.log('onNodeClick:', nodeObject)
        },
        onLineClick(lineObject, $event) {
            console.log('onLineClick:', lineObject)
        }
    }
}
</script>
